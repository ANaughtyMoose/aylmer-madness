// Language, per speaker:  node tools/smoke_lang.mjs
//
// Two halves.
//
// A. The English version, and the French it falls back to. Thomas, 2026-09-07
//    wanted the English copy easy to get and hard to read (the photocopy);
//    Tom, 20 Oct 2026: real English controls, so an anglophone friend can
//    play. This checks: both languages offered, French first; every menu and
//    key label resolves in English, as real English with no em dash; missing
//    English falls through to French, never to the raw key; back to French,
//    every string is French.
//
// B. Who speaks what (plan v2, B-15; hard rule 1). Every game-visible spoken
//    line is tagged by speaker from its file's `who` field or its call site:
//      main      the main cast (Tom, his friends, Margaret, Dad on the phone):
//                English
//      walkon    everyone else (Norm, staff, rivals, pedestrians, the police):
//                Quebec French
//      narrator  briefs, toasts, cards, tips, the porch's « day » line: French
//      radio     real airchecks and the stations' copy: as recorded, tagged
//                and counted, never judged
//      setpiece  Tom's 6 Oct beat, the gang switching to French at the
//                Saint-Jean fire: French on purpose, never a breach
//    A breach on a line in tools/lang-allowlist.json (today's known breaches,
//    frozen 13 Oct 2026, each with the task that owns its fix) is reported and
//    passes; every other line is checked strictly, so any new or edited line
//    must follow the rule. The allowlist may only shrink: ALLOW_MAX below is
//    its size when frozen, and an allowlist that grows past it fails.
//    `en` fields that are glosses (heckles, ambient, racing, ui) are the slang
//    gloss on G, not a spoken line, and are not collected.
//
// For other tools: `speakerLines(who, lang)` returns the collected lines that
// `who` says in `lang` ('en' | 'fr' | 'mix' | 'any'), e.g.
// `await speakerLines('Sayyad', 'en')` is every line Sayyad says in English,
// the only pool a friend line may be drawn from (B-03, E-11). Node only: it
// reads src/ and assets/text/ from disk.
//
// Flags: --plant-who=<speaker> --plant="<text>" adds one line as if it were in
// the game (it must fail when it breaks the rule); --dump prints every breach
// with its key; --write-allowlist rewrites the allowlist from today's breaches
// (the freeze; never run it to make a new line pass).
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const ALLOW_PATH = join(HERE, 'lang-allowlist.json');
// The allowlist's size when frozen (297 on 13 Oct 2026; 293 after s1-d31; 191
// after S1-ENGLISH, 20 Oct 2026). Lower it when entries are fixed; never raise it.
export const ALLOW_MAX = 191;

// ---------------------------------------------------------------- speakers

// The cast list in docs/STORY-LEDGER.md (first names only) plus Tom and Margaret.
export const MAIN_CAST = ['Tom', 'Sayyad', 'Zahra', 'Adam', 'Mike', 'Abraham', 'Tyler', 'Russell', 'Rob', 'Robin', 'Alex', 'Margaret'];
const MAIN_RE = new RegExp(`^(?:${MAIN_CAST.join('|')})$`);
const DAD_RE = /^Ton père, au téléphone$/;
export function speakerKind(who, src = '') {
  if (/^(SAINT_JEAN)/.test(src)) return 'setpiece';
  if (/^radio/.test(src)) return 'radio';
  const w = String(who || '').trim();
  if (!w) return 'narrator';
  if (MAIN_RE.test(w) || DAD_RE.test(w)) return 'main';
  return 'walkon';
}

// ---------------------------------------------------------------- the classifier
//
// Deliberately simple, like smoke_canon's: whole-word function words, with
// Unicode letters on both sides (\b does not see « é » as a letter).
const words = (list) => new RegExp(`(?<![\\p{L}’])(?:${list})(?![\\p{L}’])`, 'giu');
const EN = words('the|you|your|you’re|you’ll|i|i’m|i’ll|i’d|it’s|it|is|are|was|were|and|my|me|what|don’t|won’t|can’t|didn’t|isn’t|that’s|that|this|with|for|of|to|in|on|at|he|she|we|they|did|do|does|not|no|yes|just|good|thanks|home|come|call|there’s|here’s|who|where|why|how|so|ok|okay|wait|next|time|again|have|has|had|be|been|get|got|go|going|know|think|said|say|if|but|or|out|up|about|all|one|two|three|now|then|there|here|look|like|will|would|could|should|right|back|still|never|ever|an|a|his|her|their|our|its|him|them|us|am|let’s|gonna|yeah|sorry|please|really|very|much|more|any|some|before|after|tonight|tomorrow|today');
const FR = words('le|la|les|un|une|des|du|de|pis|pas|je|tu|il|elle|y|c’est|ça|que|qui|est|mon|ma|mes|ton|ta|tes|sa|ses|au|aux|dans|pour|avec|chez|faut|va|vas|oui|non|bon|merci|là|sur|moi|toi|lui|nous|vous|ils|elles|avant|après|quand|comme|mais|encore|déjà|jamais|rien|tout|trois|deux|cinq|sept|si|prend|parle|fait|t’as|j’ai|t’es|c’était|j’suis|j’sais|et|ou|ce|cette|ces|leur|sont|suis|ai|avez|avons|ont|être|avoir|vais|veux|peux|sais|dit|dis|fais|ben|moé|toé|icitte|faque|tsé|astheure|ouais|heille|ostie|tabarnak|câlisse|calvaire|voyons|tiens|envoye|aweille|pantoute|chum|ayoye|j’veux|j’pense|y’a|c’tait|su’l|d’la|qu’est-ce|est-ce|n’est|j’t’ai|t’sais|votre|vos|notre|nos|monsieur|madame|ici|aussi|très|peut|ben');
const count = (re, s) => (s.match(re) || []).length;
// Proper names are not language: « Les Galeries », « Le Tour », « de la Gare ».
const stripNames = (s) => s.replace(/(?<![\p{L}’])(?:[Ll]es?|[Ll]a|[Dd]u|[Dd]es|[Dd]e(?: [Ll]a)?|[Dd]’|[Ll]’|[Cc]hez|[Ss]ur|[Ss]ainte?-?|[Rr]ue|[Cc]hemin|[Bb]oulevard|[Aa]venue|[Pp]arc|[Cc]afé|[Cc]entre|[Pp]lace|[Pp]ont|[Dd]épanneur)\s*(?=\p{Lu})/gu, ' ')
  .replace(/(?<![\p{L}’])\p{Lu}[\p{L}’-]*(?:\s+\p{Lu}[\p{L}’-]*)+/gu, ' ');
const norm = (t) => String(t).replace(/[«»“”"]/g, ' ').replace(/'/g, '’').replace(/\\n/g, ' ');

// 'en' | 'fr' | 'mix' | 'none' for one line.
export function langOf(text) {
  const s = norm(text);
  const body = stripNames(s);
  const en = count(EN, body), fr = count(FR, body);
  if (!en && !fr) return 'none';
  if (fr === 0) return 'en';
  if (en === 0) return 'fr';
  // A French word or two inside an English sentence (« the dep », « pis ») is
  // still an English line; an English word inside French is franglais.
  if (en >= 4 * fr && fr <= 1) return 'en';
  return 'mix';
}
// The rule, as a predicate: null when the line is fine, else the reason.
export function breachOf(kind, text) {
  const l = langOf(text);
  if (kind === 'main') return (l === 'en' || l === 'none') ? null : `main cast in ${l === 'fr' ? 'French' : 'franglais'}`;
  if (kind === 'walkon' || kind === 'narrator') {
    if (l !== 'en') return null;
    // « OK », « Wow » and one-word English loans are not an English line.
    const n = count(EN, stripNames(norm(text)));
    return n >= 2 ? `${kind} in English` : null;
  }
  return null;
}

// ---------------------------------------------------------------- collect

const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const json = (n) => JSON.parse(read('assets/text/' + n));
const srcCache = new Map();
const srcOf = (rel) => { if (!srcCache.has(rel)) { try { srcCache.set(rel, read(rel)); } catch { srcCache.set(rel, ''); } } return srcCache.get(rel); };
const lineAt = (txt, i) => (i < 0 ? 0 : txt.slice(0, i).split('\n').length);
// The file and line a string lives on, searched in the given files in order.
function locate(text, files) {
  const t = String(text);
  const inner = t.replace(/^«\s*/, '').replace(/\s*»$/, '');
  const needles = [t, inner, inner.replace(/’/g, "'"), JSON.stringify(inner.replace(/’/g, "'")).slice(1, -1), inner.replace(/’/g, "'").slice(0, 24), inner.slice(0, 24), t.replace(/’/g, "'"), JSON.stringify(t).slice(1, -1), t.replace(/'/g, "\\'"), t.slice(0, 24), t.replace(/’/g, "'").slice(0, 24)]
    .filter((x) => x && x.length >= 3);
  for (const f of [...files, ...walkSrc('src')]) {
    const s = srcOf(f);
    for (const n of needles) { const i = s.indexOf(n); if (i >= 0) return { file: f, line: lineAt(s, i) }; }
  }
  return { file: files[0], line: 0 };
}

let SRC_LIST = null;
function walkSrc(dir, out = []) {
  if (dir === 'src' && SRC_LIST && !out.length) return SRC_LIST;
  const top = dir === 'src' && !out.length;
  for (const n of readdirSync(join(ROOT, dir))) {
    const rel = dir + '/' + n;
    const st = statSync(join(ROOT, rel));
    if (st.isDirectory()) walkSrc(rel, out);
    else if (/\.js$/.test(n) && !/mapdata|ground_data|_data\.js$/.test(n) && st.size < 600000) out.push(rel);
  }
  if (top) SRC_LIST = out;
  return out;
}

let CACHE = null;
// Every collected line: { src, file, line, who, kind, text }.
export async function collectLines() {
  if (CACHE) return CACHE;
  const mem = new Map();
  globalThis.localStorage = globalThis.localStorage || {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), clear: () => mem.clear(),
  };
  const rows = [];
  const seen = new Set();
  const QUOTE = new RegExp(`(?<![\\p{L}])(${MAIN_CAST.join('|')})\\s*:\\s*(«[^»]+»)`, 'gu');
  const add = (src, who, text, files) => {
    if (typeof text !== 'string' || !text.trim()) return;
    // A narrator line that quotes the cast (« Russell: « … » ») is that person speaking.
    if (!who && QUOTE.test(text)) {
      QUOTE.lastIndex = 0;
      for (const m of text.matchAll(QUOTE)) add(src, m[1], m[2], files);
      const rest = text.replace(QUOTE, ' ').trim();
      if (rest.replace(/[\s.,:;!?…-]/g, '').length < 4) return;
      text = rest;
    }
    const kind = speakerKind(who, src);
    const k = `${kind}|${who || ''}|${text}`;
    if (seen.has(k)) return;
    seen.add(k);
    const at = locate(text, files);
    rows.push({ src, file: at.file, line: at.line, who: who || '', kind, text });
  };
  const STORY = ['src/game/story.js'], ARC = ['src/game/arc.js'];

  const { ALL_MISSIONS } = await import('../src/game/missions.js');
  const arc = await import('../src/game/arc.js');
  const GN = await import('../src/game/setpieces/golfnuit.js');
  const story = await import('../src/game/story.js');
  const hang = await import('../src/game/hangout.js');
  for (const f of story.DIALOGUE_FILES || ['dialogue.json', 'zahra.json']) story.applyDialogue(json(f));

  // Missions: stage text is the narrator, a stop's line is its `who`.
  const missionFiles = ['src/game/missions.js', 'src/game/verbjobs.js', 'src/game/sidejobs.js', 'src/game/lifejobs.js',
    'src/game/racejobs.js', 'src/game/golfjob.js', 'src/game/arc.js', 'src/game/missionkit.js', 'assets/text/arc.json'];
  const TEXT_KEYS = ['text', 'sub', 'hint', 'toast', 'holdText', 'brokeText', 'failWhy', 'pickText', 'pickSub', 'pickHint',
    'loadText', 'loadSub', 'loadHint', 'loadToast', 'thenText', 'thenSub', 'thenHint', 'lostToast', 'gridText', 'gridSub',
    'gridHold', 'gridToast', 'intro', 'win', 'clockFail', 'airWhy', 'go', 'start', 'clue'];
  const ctxs = [{ carId: 'ranger', carName: 'Ranger', seats: 2, places: 3 }, { carId: 'saturn', carName: 'Saturn', seats: 4, places: 5 }];
  for (const def of ALL_MISSIONS) {
    add(`${def.id}:title`, '', def.title, missionFiles);
    add(`${def.id}:brief`, '', def.brief, missionFiles);
    for (const ctx of ctxs) {
      let stages = [];
      try { stages = def.build(ctx) || []; } catch { stages = []; }
      for (const st of stages) {
        for (const k of TEXT_KEYS) add(`${def.id}:${k}`, '', st[k], missionFiles);
        for (const s of st.stops || []) add(`${def.id}:stop`, s.who, s.line, missionFiles);
      }
    }
  }
  // The cast's own pools.
  for (const [id, e] of Object.entries(story.FRIEND_LINES)) for (const w of ['start', 'end']) for (const [who, t] of e[w] || []) add(`FRIEND_LINES.${id}`, who, t, STORY);
  for (const [id, e] of Object.entries(arc.ARC_LINES)) for (const w of ['start', 'end']) for (const [who, t] of e[w] || []) add(`ARC_LINES.${id}`, who, t, ARC);
  for (const c of arc.FINALE_CALLBACKS) { add('FINALE_CALLBACKS', '', c.line, ARC); for (const [who, t] of c.friends || []) add('FINALE_CALLBACKS', who, t, ARC); }
  for (const [who, t] of arc.FINALE_CALL) add('FINALE_CALL', who, t, ARC);
  for (const [who, t] of [...arc.SAINT_JEAN_FRENCH, ...arc.SAINT_JEAN_REPLY]) add('SAINT_JEAN', who, t, ARC);
  const GNF = ['src/game/setpieces/golfnuit.js'];
  for (const t of [...Object.values(GN.SAYYAD), ...GN.SAY_JUMP, ...[0, 1, 2].map((i) => GN.tryKey({ tries: i, works: false }).key.say)]) add('GOLFNUIT', 'Sayyad', t, GNF);
  for (const t of [...GN.OWNERS_LINES, GN.OWNERS_CLOSE, GN.OWNERS_LAST]) add('GOLFNUIT', GN.OWNERS_WHO, t, GNF);
  for (const [who, pool] of Object.entries(story.GREETINGS)) for (const t of pool) add(`GREETINGS.${who}`, who[0].toUpperCase() + who.slice(1), t, STORY);
  for (const [who, sets] of Object.entries(story.DIALOGUE)) for (const [when, pool] of Object.entries(sets)) {
    for (const t of pool) add(`DIALOGUE.${who}.${when}`, who, t, ['assets/text/dialogue.json', 'assets/text/zahra.json', 'src/game/story.js']);
  }
  for (let i = 0; i < story.DAD_CALLS.length; i++) for (const [who, t] of story.dadCall(i).bubbles) add('DAD_CALLS', who, t, STORY);
  for (const c of story.STORY_CARDS) add('STORY_CARDS', '', c.body, STORY);
  for (const c of story.endingCards({ streets: 'Rues d’Aylmer que tu connais : 40 %' })) add('endingCards', '', c.body, STORY);
  // The porch.
  const hj = json('hangout.json');
  const hname = (k) => (hj.names && hj.names[k]) || (hang.FALLBACK.names && hang.FALLBACK.names[k]) || k;
  for (const sec of ['greet', 'catch', 'job', 'leave']) {
    for (const r of hj[sec] || []) add(`hangout.json.${sec}`, hname(r.who), r.line, ['assets/text/hangout.json']);
    for (const r of hang.FALLBACK[sec] || []) add(`hangout.js.${sec}`, hname(r.who), r.line, ['src/game/hangout.js']);
  }
  for (const [k, pool] of Object.entries(hj.slalom || {})) for (const r of pool) add(`hangout.json.slalom.${k}`, hname(r.who), r.line, ['assets/text/hangout.json']);
  for (const t of [...(hj.day || []), ...(hang.FALLBACK.day || [])]) add('hangout.day', '', t, ['assets/text/hangout.json', 'src/game/hangout.js']);
  // The opener.
  const main = srcOf('src/main.js');
  const op = main.indexOf('function playStory()');
  if (op >= 0) {
    const body = main.slice(op, main.indexOf('onDone:', op)).replace(/^\s*\/\/.*$/gm, '');
    // (« Get in → » is the English-mode button, the i18n photocopy, not a line.)
    for (const m of body.matchAll(/'((?:[^'\\\n]|\\.){6,})'/g)) if (!/=== 'en' \? $/.test(body.slice(Math.max(0, m.index - 12), m.index))) add('main.js:playStory', '', m[1].replace(/\\'/g, "'"), ['src/main.js']);
  }
  // The street: heckles (walk-ons by trigger), the crowd, the police radio.
  const HK = ['assets/text/heckles.json'];
  for (const r of json('heckles.json').heckles || []) add(`heckles.json.${r.trigger}`, 'Passant', r.fr, HK);
  const heck = await import('../src/game/heckle.js');
  for (const [k, pool] of Object.entries(heck.HECKLES)) for (const t of pool) add(`heckle.js.${k}`, heck.SPEAKER[k] || 'Passant', t, ['src/game/heckle.js']);
  const amb = json('ambient.json');
  for (const r of amb.ambient || []) add('ambient.json', 'Passant', r.line, ['assets/text/ambient.json']);
  for (const r of amb.police || []) add('ambient.json.police', 'Police', r.line, ['assets/text/ambient.json']);
  const peds = await import('../src/game/peds.js');
  for (const r of peds.AMBIENT) add('peds.js', 'Passant', r.line, ['src/game/peds.js']);
  // Fail cards: the card text is the narrator; a gag with a `who` is that person.
  const fails = json('fails.json');
  for (const v of Object.values(fails.card || {})) add('fails.json.card', '', v, ['assets/text/fails.json']);
  for (const [r, pool] of Object.entries(fails.reasons || {})) for (const g of pool) {
    add(`fails.json.${r}`, g.who || '', g.who ? (g.en || g.fr) : (g.fr || g.en), ['assets/text/fails.json']);
    if (g.who && g.fr && g.en) add(`fails.json.${r}`, g.who, g.fr, ['assets/text/fails.json']);
  }
  // Racing: rivals' taunts and the crowd's callouts are walk-on pools.
  const rj = json('racing.json');
  for (const r of rj.taunts || []) add(`racing.json.taunts.${r.when}`, 'Rival', r.line, ['assets/text/racing.json']);
  for (const r of rj.callouts || []) add(`racing.json.callouts.${r.when}`, 'Témoin', r.line, ['assets/text/racing.json']);
  // Norm, Grisha, the Kijiji sellers on the phone.
  const mech = json('mechanic.json').mechanic || {};
  for (const k of ['greetings', 'broke', 'wrecked']) for (const t of mech[k] || []) add(`mechanic.json.${k}`, 'Norm', t, ['assets/text/mechanic.json']);
  for (const r of mech.work || []) add('mechanic.json.work', 'Norm', r.line, ['assets/text/mechanic.json']);
  const gr = json('grisha.json').restorer || {};
  for (const k of ['greetings', 'quote', 'done', 'broke', 'refuse', 'aside']) for (const t of gr[k] || []) add(`grisha.json.${k}`, 'Grisha', t, ['assets/text/grisha.json']);
  for (const c of json('calls.json').calls || []) for (const k of ['opening', 'middle']) add(`calls.json.${k}`, 'Vendeur', c[k], ['assets/text/calls.json']);
  // Loading tips and the pause line: the narrator.
  const ui = json('ui.json');
  for (const r of ui.loading || []) add('ui.json.loading', '', r.line, ['assets/text/ui.json']);
  for (const t of ui.pause || []) add('ui.json.pause', '', t, ['assets/text/ui.json']);
  // The radio: tagged, counted, never judged (real airchecks are as recorded).
  const radio = json('radio.json');
  for (const s of radio.stations || []) for (const k of ['idents', 'patter', 'stingers', 'contests']) for (const t of s[k] || []) add(`radio.json.${s.id}.${k}`, s.call || 'Radio', t, ['assets/text/radio.json']);
  for (const r of json('radio_extra.json').contextual || []) add('radio_extra.json', r.station || 'Radio', r.line, ['assets/text/radio_extra.json']);
  // Call sites: any ('Sayyad', '…') or ['Sayyad', '…'] for a main-cast speaker in src/,
  // which covers the pools above and every heckle.line()/say() written inline.
  const castAlt = MAIN_CAST.join('|');
  const re = new RegExp(`[\\[(]\\s*'(${castAlt})'\\s*,\\s*'((?:[^'\\\\\\n]|\\\\.){2,})'`, 'g');
  for (const f of walkSrc('src')) {
    const s = srcOf(f).replace(/^\s*\/\/.*$/gm, (m) => ' '.repeat(m.length));
    for (const m of s.matchAll(re)) add(`callsite:${relative(ROOT, join(ROOT, f))}`, m[1], m[2].replace(/\\'/g, "'"), [f]);
  }
  CACHE = rows;
  return rows;
}

// The lines `who` says, in `lang` ('en' | 'fr' | 'mix' | 'any'). For a main-cast
// speaker 'en' includes lines with no language words in them (« ...ouais » is
// French; « Twice. » is English; « ... » is nothing and counts as neither).
export async function speakerLines(who, lang = 'en') {
  const rows = await collectLines();
  return rows.filter((r) => r.who === who && r.kind !== 'setpiece').filter((r) => {
    if (lang === 'any') return true;
    const l = langOf(r.text);
    if (lang === 'en') return l === 'en';
    return l === lang;
  }).map((r) => r.text);
}

// ---------------------------------------------------------------- the allowlist

// Which later task owns the fix, by the file the line lives in (plan v2, 1.4/1.5).
export function ownerOf(file, line) {
  if (file === 'src/game/story.js' && line === 350) return 'B-06';
  if (/arc\.(js|json)$/.test(file)) return 'E-01';
  if (/heckles\.json$/.test(file)) return 'E-03';
  if (/radio(_extra)?\.json$/.test(file)) return 'E-04';
  if (file === 'src/main.js') return 'E-05';
  if (/hangout\.json$/.test(file)) return 'E-07';
  return 'E-06';
}
const keyOf = (r) => `${r.who}|${r.text}`;
function loadAllow() {
  try { return JSON.parse(readFileSync(ALLOW_PATH, 'utf8')); } catch { return { entries: [] }; }
}

// ---------------------------------------------------------------- run

async function run() {
  let pass = 0, fail = 0;
  const ok = (cond, name, extra) => {
    if (cond) { pass++; console.log('  ok   ' + name); }
    else { fail++; console.log('  FAIL ' + name + (extra ? '  - ' + extra : '')); }
  };
  const group = (n) => console.log('\n' + n);
  const arg = (k) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };

  // ---- A. the photocopy
  const { t, setLang, getLang, languages, KEYMAP } = await import('../src/game/i18n.js');
  const MENU = ['menu.continue', 'menu.new', 'menu.load', 'menu.options', 'menu.garageview',
    'menu.pickstart', 'menu.pickstart.hint', 'menu.english', 'menu.erratum',
    'save.hint', 'save.none', 'opt.title', 'opt.lang', 'pause.title', 'k.recover', 'k.tow'];
  group('the switch');
  const langs = languages();
  ok(langs.length === 2 && langs[0][0] === 'fr' && langs[1][0] === 'en', 'two languages, French first', JSON.stringify(langs));
  ok(setLang('fr') === 'fr' && getLang() === 'fr', 'starts French');
  const fr = {};
  for (const k of MENU) fr[k] = t(k);
  for (const r of KEYMAP) fr[r.label] = t(r.label);
  ok(Object.values(fr).every((v) => v && !/^[a-z]+\.[a-z.]+$/.test(v)), 'every French string resolves');
  group('the English copy');
  ok(setLang('en') === 'en' && getLang() === 'en', 'the switch takes en');
  ok(setLang('klingon') === 'fr', 'and nothing else');
  setLang('en');
  let same = 0, raw = 0;
  for (const k of Object.keys(fr)) { const v = t(k); if (v === k) raw++; if (v === fr[k]) same++; }
  ok(raw === 0, 'no key comes back raw in English');
  // Real English shares five words with the French: Options (twice), Pause
  // (twice), Menu. Anything more identical than that is a missing translation.
  ok(same <= 5, 'the English strings are actually different from the French (' + same + ' identical: Options, Pause, Menu)');
  // Real English where it counts (Tom, 20 Oct 2026): the controls a friend
  // who reads no French needs, not the gag calques (« Brake of hand »).
  ok(t('k.handbrake') === 'Handbrake' && t('k.recover') === 'Back on the road' && t('pause.map') === 'Map',
    'the key labels are real English: ' + t('k.handbrake') + ', ' + t('k.recover'));
  ok(t('save.loaded') === 'Game loaded' && t('menu.new').includes('NEW GAME'), 'and so are the menu and save strings: ' + t('menu.new'));
  ok(/handbrake/i.test(t('tut.hand')) && /brake/i.test(t('tut.brake')) && !/for to/.test(t('tut.brake') + t('tut.job')), 'the tutorial teaches in real English');
  const enAll = [...Object.keys(fr), 'tut.go', 'tut.steer', 'tut.brake', 'tut.hand', 'tut.map', 'tut.job', 'tut.done', 'menu.tag', 'k.pad', 'opt.keyhint'].map((k) => t(k));
  ok(!enAll.some((v) => /[—–]/.test(v)), 'no em dash or en dash in the English copy');
  ok(languages()[1][1] === 'English', 'the picker calls it English, not a photocopy');
  ok(t('not.a.key.anywhere') === 'not.a.key.anywhere', 'an unknown key is still the key');
  ok(t('toast.slang.on') === fr['toast.slang.on'] || t('toast.slang.on') !== 'toast.slang.on', 'a French-only key falls through to French, never raw');
  group('and back');
  setLang('fr');
  ok(Object.keys(fr).every((k) => t(k) === fr[k]), 'French is exactly what it was');

  // ---- B. who speaks what
  group('the classifier');
  ok(langOf('Deux heures. J’ai lu le manuel du Ranger. Twice.') !== 'en', 'franglais is not English');
  ok(langOf('I’ll be asleep. Wake me at the dep.') === 'en', 'English with a local word is English');
  ok(langOf('Meet me at Les Galeries after six.') === 'en', 'a French place name does not make a line French');
  ok(langOf('Pis un jour, tu la répares.') === 'fr', 'French is French');
  ok(breachOf('main', 'Je stationne le Ranger, pis je rentre.') !== null, 'a main-cast French line is a breach');
  ok(breachOf('walkon', 'Where did you get your licence?') !== null, 'a walk-on English line is a breach');
  ok(breachOf('walkon', 'OK!') === null, 'one English loan word is not an English line');
  ok(speakerKind('Sayyad') === 'main' && speakerKind('Ton père, au téléphone') === 'main' && speakerKind('Norm') === 'walkon'
    && speakerKind('') === 'narrator' && speakerKind('Sayyad', 'SAINT_JEAN') === 'setpiece', 'speaker tags');

  const rows = [...await collectLines()];
  const pw = arg('plant-who'), pt = arg('plant');
  if (pt != null) rows.push({ src: 'planted', file: 'planted', line: 0, who: pw || '', kind: speakerKind(pw || ''), text: pt });

  group('every spoken line, tagged by speaker');
  const byKind = {};
  for (const r of rows) byKind[r.kind] = (byKind[r.kind] || 0) + 1;
  console.log(`  ${rows.length} lines: ` + Object.entries(byKind).map(([k, n]) => `${k} ${n}`).join(', '));
  ok((byKind.main || 0) >= 300 && (byKind.walkon || 0) >= 300 && (byKind.narrator || 0) >= 200, 'the collector sees the cast, the street and the narrator');
  ok(rows.filter((r) => r.kind === 'main' && r.who === 'Margaret').length >= 30, 'Margaret’s lines are collected');

  const breaches = rows.map((r) => ({ ...r, why: breachOf(r.kind, r.text) })).filter((r) => r.why);
  if (process.argv.includes('--write-allowlist')) {
    const entries = breaches.filter((r) => r.src !== 'planted').map((r) => ({
      who: r.who, kind: r.kind, file: r.file, line: r.line, owner: ownerOf(r.file, r.line), why: r.why, text: r.text,
    }));
    entries.sort((a, b) => (a.file + String(a.line).padStart(6, '0')).localeCompare(b.file + String(b.line).padStart(6, '0')));
    const byOwner = {};
    for (const e of entries) byOwner[e.owner] = (byOwner[e.owner] || 0) + 1;
    writeFileSync(ALLOW_PATH, JSON.stringify({
      _: 'Known language breaches frozen on 13 Oct 2026 (plan v2, B-15). Each entry names the task that owns its fix. Matched by who + exact text, so an edited line is checked strictly. This list may only shrink; tools/smoke_lang.mjs ALLOW_MAX is its frozen size. Empty by the wave E gate.',
      frozen: '2026-10-13', count: entries.length, byOwner, entries,
    }, null, 1) + '\n');
    console.log(`  wrote ${entries.length} entries to tools/lang-allowlist.json`);
  }
  const allow = loadAllow();
  const allowed = new Set((allow.entries || []).map(keyOf));
  const known = breaches.filter((r) => allowed.has(keyOf(r)));
  const fresh = breaches.filter((r) => !allowed.has(keyOf(r)));
  const live = new Set(breaches.map(keyOf));
  const stale = (allow.entries || []).filter((e) => !live.has(keyOf(e)));
  const owners = {};
  for (const r of known) { const o = ownerOf(r.file, r.line); owners[o] = (owners[o] || 0) + 1; }
  console.log(`  allowlist: ${(allow.entries || []).length} entries, ${known.length} still breach (` + Object.entries(owners).sort().map(([o, n]) => `${o} ${n}`).join(', ') + `), ${stale.length} fixed or gone`);
  if (process.argv.includes('--dump')) for (const r of breaches) console.log(`    [${allowed.has(keyOf(r)) ? 'allow' : 'NEW  '}] ${r.file}:${r.line} ${r.who || '(narrator)'}: ${r.text.slice(0, 90)}`);
  ok((allow.entries || []).length <= ALLOW_MAX, `the allowlist only shrinks (${(allow.entries || []).length} <= ${ALLOW_MAX})`);
  ok((allow.entries || []).every((e) => /^(B-06|E-0[1-7])$/.test(e.owner)), 'every allowlist entry names its owner task');
  const at350 = (allow.entries || []).find((e) => e.file === 'src/game/story.js' && e.line === 350);
  const at66 = (allow.entries || []).find((e) => e.file === 'assets/text/hangout.json' && e.line === 66);
  ok(!!at350 && at350.owner === 'B-06', 'story.js:350 is on the allowlist, owner B-06');
  ok(!!at66 && at66.owner === 'E-07', 'hangout.json:66 is on the allowlist, owner E-07');
  ok(fresh.length === 0, `no breach outside the allowlist (${fresh.length})`,
    fresh.slice(0, 5).map((r) => `${r.file}:${r.line} ${r.who || '(narrator)'} [${r.why}]: ${r.text.slice(0, 70)}`).join(' | '));
  // One tic per friend, nobody shares one (Tom, 20 Oct 2026; S1-ENGLISH).
  // The owner of each is in story.js's header. « Trust me » belongs to nobody:
  // it was Sayyad's, Russell's and Mike's at once and read as one writer.
  // Russell's is the shouted « SCIENCE! », not the word (Sayyad's fail gag
  // about the sauna's science is a sentence, not a tic).
  group('one tic each, never shared');
  const TICS = [
    ['Trust me', /\btrust me\b/i, null], ['OK OK OK', /\bok,? ok,? ok\b/i, 'Sayyad'], ['Hear me out', /\bhear me out\b/i, 'Mike'],
    ['Wrong.', /(^|[«\s])wrong[.,! ]/i, 'Zahra'], ['frolicking in mayo', /\bfrolicking\b/i, 'Adam'],
    ['SCIENCE!', /\bscience!/i, 'Russell'], ['not my fault / the hill', /\b(not my fault|my fault|the hill)\b/i, 'Russell'],
  ];
  const castRows = rows.filter((r) => r.kind === 'main' && r.who !== 'Tom' && r.who !== 'Margaret' && !DAD_RE.test(r.who));
  for (const [name, re, owner] of TICS) {
    const users = [...new Set(castRows.filter((r) => re.test(r.text)).map((r) => r.who))];
    const bad = users.filter((w) => w !== owner);
    ok(bad.length === 0, `« ${name} » is ${owner || 'nobody'}’s only (${users.join(', ') || 'unused'})`,
      castRows.filter((r) => re.test(r.text) && r.who !== owner).map((r) => `${r.file}:${r.line} ${r.who}: ${r.text.slice(0, 50)}`).join(' | '));
  }
  // A friend line comes only from the friend's own English lines.
  const sayEn = await speakerLines('Sayyad', 'en');
  ok(sayEn.length >= 10 && sayEn.every((x) => langOf(x) === 'en'), `speakerLines('Sayyad', 'en'): ${sayEn.length} lines, all English`);
  ok((await speakerLines('Margaret', 'fr')).length === 0, "speakerLines('Margaret', 'fr') is empty: she speaks English");

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await run();
