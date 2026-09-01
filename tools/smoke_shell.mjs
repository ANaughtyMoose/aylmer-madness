// Shell smoke test — the menu's start points, the slang gloss, the weather and
// the radio dial. Plain node, hand-rolled stubs, no browser and no framework.
//
//   node tools/smoke_shell.mjs
//
// main.js itself cannot be imported here (it builds a WebGL context on the first
// line it runs), so the two things it owns — the start-point list and the
// day/night weights — are checked by reading the source. That is on purpose:
// both are tables whose whole failure mode is being silently wrong, and the
// start list in particular is filtered by `PLACES[key]` existing, so a typo used
// to make an entry vanish rather than break.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---------------------------------------------------------------- stubs

class FakeStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
  clear() { this.m.clear(); }
  get length() { return this.m.size; }
}
globalThis.localStorage = new FakeStorage();

// ---------------------------------------------------------------- harness

let pass = 0, fail = 0;
const fails = [];
function ok(cond, what, extra) {
  if (cond) { pass++; return; }
  fail++; fails.push(what);
  console.log('  FAIL  ' + what + (extra ? '   (' + extra + ')' : ''));
}
function eq(a, b, what) {
  const same = JSON.stringify(a) === JSON.stringify(b);
  if (!same) console.log(`         got ${JSON.stringify(a)}  want ${JSON.stringify(b)}`);
  ok(same, what);
}
function group(name) { console.log('\n' + name); }

// ---------------------------------------------------------------- imports

const { PLACES } = await import('../src/game/places.js');
const { t, KEYMAP } = await import('../src/game/i18n.js');
const {
  Heckle, HECKLES, GLOSS, allLines, glossOf, noteOf,
  ingestHeckles, TRIGGER_ALIAS, JSON_TRIGGERS,
} = await import('../src/game/heckle.js');
const {
  Weather, STATES, STATE_KEYS, puddleAt, WET_GRIP,
} = await import('../src/game/weather.js');
const {
  Radio, STATIONS, STATION_NAMES, STYLES, CKOI_TRACKS, TAPE_NAME, BREAK_SECONDS,
  MUSIC, stationsFromJSON, chunkCopy, AD_CHUNK,
} = await import('../src/game/radio.js');
const { SECTIONS, optionsHTML } = await import('../src/game/options.js');
const { DEFAULT_SETTINGS } = await import('../src/game/store.js');
const { TIME_OF_DAY } = await import('../src/game/missions.js');

const MAIN = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');
// `const NAME = [ ... ];` out of main.js, as a real array.
function arrayFromMain(name) {
  const m = new RegExp(`const ${name} = \\[([^\\]]*)\\]`).exec(MAIN);
  if (!m) return null;
  return m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
}

// ---------------------------------------------------------------- 1. starts

group('the start picker');
{
  const starts = arrayFromMain('START_POINTS');
  ok(Array.isArray(starts) && starts.length >= 15, `${starts && starts.length} start points`);
  for (const key of starts) {
    ok(!!PLACES[key], `start point « ${key} » is a real place`);
    ok(!!(PLACES[key] && PLACES[key].label), `start point « ${key} » has a label to show`);
    // The list is filtered by PLACES[key] existing, so a bad key does not throw
    // — it disappears. That is the bug this loop exists to catch.
    ok(new RegExp(`\\b${key}\\s*:`).test(MAIN), `« ${key} » has a short map label`);
  }
  ok(starts.includes('home'), '299 Chemin Fraser is on the list');
  ok(starts.includes('sayyad'), '75 Denise-Friend is on the list');
  eq(PLACES.sayyad.x, PLACES.steph.x, 'sayyad and the legacy steph key are the same house');
  eq(PLACES.sayyad.z, PLACES.steph.z, '…and the same z');
  // Legacy internal ids never reach the player, not even as a data attribute.
  for (const legacy of ['steph', 'marc', 'dave']) {
    ok(!starts.includes(legacy), `the legacy id « ${legacy} » is not a start point`);
  }

  ok(/const DEFAULT_START = 'home'/.test(MAIN), 'the default start is your own driveway');
  // The confirm button is never disabled on arrival any more.
  ok(/btn\.disabled = false/.test(MAIN), 'the picker confirm button starts enabled');
  ok(!/\$\('startconfirm'\)\.disabled = true/.test(MAIN), 'nothing switches it back off');
  ok(/selectStart\(first\.includes\(DEFAULT_START\)/.test(MAIN), 'opening the picker selects something');
}

group('the GO button');
{
  ok(t('menu.new').includes('GO'), `the main button says GO — « ${t('menu.new')} »`);
  eq(t('menu.go'), 'GO', 'and so does the confirm');
  eq(t('menu.drive'), 'EMBARQUE', 'the old wording is still available to anyone who wants it');
  ok(t('menu.pickstart.hint').includes('GO'), 'the picker hint tells you to press it');
}

// ---------------------------------------------------------------- 2. day/night

group('the day/night cycle');
{
  const w = /const DAY_WEIGHT = \[([^\]]*)\]/.exec(MAIN);
  ok(!!w, 'the phase weights are a table');
  const nums = w[1].split(',').map((s) => parseFloat(s));
  eq(nums.length, 4, 'one weight per phase');
  ok(Math.abs(nums.reduce((a, b) => a + b, 0) - 1) < 1e-9, 'the weights make one whole loop');
  ok(nums[1] > nums[0] && nums[1] > nums[2], 'day is the longest phase');
  ok(nums[2] < 0.2, 'dusk is short — the sun goes down over the river in a hurry');
  ok(nums[3] > 0.2, 'night is long enough to be worth having headlights for');
  const keys = arrayFromMain('DAY_KEYS');
  eq(keys, ['morning', 'day', 'dusk', 'night'], 'the phases are the ones missions.js knows');
  for (const k of keys) ok(!!TIME_OF_DAY[k], `TIME_OF_DAY has ${k}`);
  ok(/const DAY_HOLD = 0\.\d+/.test(MAIN), 'each phase holds its own colours before blending on');
}

// ---------------------------------------------------------------- 3. gloss

group('the slang gloss (G)');
{
  const lines = allLines();
  let missing = 0;
  for (const l of lines) if (!glossOf(l)) { missing++; console.log('      no gloss: ' + l); }
  eq(missing, 0, 'every line the town yells has an English gloss');
  ok(Object.keys(GLOSS).length >= lines.length, `${Object.keys(GLOSS).length} glosses`);
  for (const [line, [en]] of Object.entries(GLOSS)) {
    ok(typeof en === 'string' && en.length > 0 && en.length <= 90, `« ${line} » has a readable gloss`);
  }
  // The three the owner asked for by name, joke and all.
  ok(HECKLES.dive.includes('T’es-tu correct, toé?'), 'the town asks if you are okay');
  ok(HECKLES.rival.includes('Attache ta tuque!'), 'and tells you to hang on');
  ok(HECKLES.dive.includes('Va donc chez l’diable!'), 'and to get lost');
  ok(/tuque/.test(noteOf('Attache ta tuque!')), 'the tuque line explains itself');
  ok(noteOf('T’es-tu correct, toé?').length > 20, '“correct” gets the note it needs');
  ok(/devil/i.test(noteOf('Va donc chez l’diable!')), 'and so does the devil');
  ok(/ARRÊT/.test(noteOf('Rouge, ça veut dire ARRÊTE!')), 'the ARRÊT joke is explained');
  ok(/chariot/i.test(noteOf('MON CHAR!')), 'a char is a chariot');

  const h = new Heckle();
  h.bind({ settings: { ...DEFAULT_SETTINGS } });
  ok(h.glossOn === false, 'the gloss starts off');
  ok(h.showGloss === false, '…and hidden');
  ok(h.hold(true) === true, 'holding G reveals');
  ok(h.showGloss === true, '…while it is held');
  h.hold(false);
  ok(h.showGloss === false, 'and hides again when you let go');
  ok(h.toggleGloss() === true, 'tapping G latches it on');
  ok(h.showGloss === true, '…and it stays on');
  ok(h.toggleGloss() === false, 'and off again');

  const said = h.say('Piéton', 'dive');
  ok(!!said, 'a line goes out');
  eq(h.recent(1)[0].text, said, 'the history remembers what was said');
  eq(h.recent(1)[0].gloss, glossOf(said), '…with its translation attached');
  for (let i = 0; i < 9; i++) { h.update(31); h.say('Piéton', 'dive'); }
  ok(h.recent(9).length <= 6, 'the history is capped');
  h.reset();
  eq(h.recent(3).length, 0, 'reset empties it');

  // It is in Options, and it is NOT a settings key (store.js would drop it).
  const jeu = SECTIONS.find((s) => s.id === 'gameplay');
  const row = jeu.rows.find((r) => r.flag === 'slangGloss');
  ok(!!row, 'the gloss has a row in Options > Jeu');
  ok(!('slangGloss' in DEFAULT_SETTINGS), 'and it is not pretending to be a setting');
  const html = optionsHTML(DEFAULT_SETTINGS);
  ok(html.includes('id="o_slangGloss"'), 'the checkbox draws');
  ok(html.includes(t('opt.slangGloss')), 'with its French label');

  // ...and on the key legend.
  const g = KEYMAP.find((k) => k.caps.includes('G'));
  ok(!!g, 'G is on the key legend');
  eq(t(g.label), t('k.slang'), 'labelled as the slang translation');
  ok(KEYMAP.every((k) => t(k.label) !== k.label), 'every legend row still has a translation');
}

// ---------------------------------------------------------------- 4. weather

group('weather — the states');
{
  for (const k of STATE_KEYS) {
    const s = STATES[k];
    ok(typeof s.label === 'string' && s.label.length > 0, `${k} has a French label (${s.label})`);
    for (const f of ['cloud', 'dark', 'rain', 'haze', 'wind']) {
      ok(s[f] >= 0 && s[f] <= 1, `${k}.${f} is 0..1`);
    }
    ok(s.dwell[0] > 0 && s.dwell[1] > s.dwell[0], `${k} has a sane dwell time`);
  }
  ok(STATES.storm.rain === 1 && STATES.storm.dark === 1, 'a storm is the dark end of both');
  ok(STATES.clear.rain === 0, 'and clear is dry');
  ok(STATES.haze.haze > 0.5 && STATES.haze.rain === 0, 'heat haze is thick air, not water');
}

group('weather — it moves');
{
  const w = new Weather({ seed: 7, state: 'clear' });
  eq(w.key, 'clear', 'it opens clear');
  const seen = new Set();
  for (let i = 0; i < 6000; i++) { w.update(0.5); seen.add(w.key); }
  ok(seen.size >= 4, `${seen.size} different skies in 50 minutes: ${[...seen].join(', ')}`);
  ok(seen.has('storm') || seen.has('rain'), 'and it rains at some point');
  // It never jumps: every state it passes through is one the table allows.
  const w2 = new Weather({ seed: 3, state: 'clear' });
  let jumps = 0, prev = w2.key;
  for (let i = 0; i < 4000; i++) {
    w2.update(0.5);
    if (w2.key !== prev) { if (w2.blend < 0.4) jumps++; prev = w2.key; }
  }
  ok(jumps === 0, 'no state ever snaps in without a blend', String(jumps));
}

group('weather — the wet road');
{
  const w = new Weather({ seed: 1, state: 'clear' });
  eq(w.gripMul, 1, 'a dry road costs nothing');
  eq(w.brakeMul, 1, '…and neither do the brakes');
  w.set('storm', true);
  for (let i = 0; i < 40; i++) w.update(0.25);
  ok(w.wet > 0.9, `a storm soaks the road (wet ${w.wet.toFixed(2)})`);
  ok(w.gripMul < 1 - WET_GRIP * 0.85, `and takes the grip with it (${w.gripMul.toFixed(3)})`);
  ok(w.gripMul > 0.6, '…but it is still a car and not a boat');
  ok(w.brakeMul < 0.9, 'stopping distance goes up too');

  // The multiplier is applied by handing the Vehicle a CLONE of its spec, so
  // cars.js — which is read-only to this agent — never has to know.
  const dry = { id: 'ranger', grip: 0.80, brake: 8.0, topSpeed: 36.5 };
  const wet = w.specFor(dry);
  ok(wet !== dry, 'a wet road hands over a different spec object');
  eq(wet.id, dry.id, '…with the same id');
  eq(wet.topSpeed, dry.topSpeed, '…and everything it did not touch');
  ok(wet.grip < dry.grip, 'the grip is down');
  ok(wet.brake < dry.brake, 'the brakes are down');
  ok(w.specFor(dry) === wet, 'and the clone is cached, not rebuilt every frame');
  ok(dry.grip === 0.80, 'the dry spec sheet is never modified');

  // It dries out, slowly, and the grip comes back with it.
  w.set('clear', false);
  for (let i = 0; i < 400; i++) w.update(0.25);
  ok(w.wet < 0.05, `the road dries (wet ${w.wet.toFixed(3)})`);
  ok(w.specFor(dry) === dry, 'and a dry road hands back the original spec');
}

group('weather — puddles');
{
  ok(puddleAt(120, 40, 0) === 0, 'a dry road has no standing water');
  const hits = [];
  for (let x = 0; x < 4000; x += 14) if (puddleAt(x, 200, 1) > 0) hits.push(x);
  ok(hits.length > 5 && hits.length < 120, `${hits.length} puddles along 4 km of one line`);
  for (const x of hits) eq(puddleAt(x, 200, 1), puddleAt(x, 200, 1), 'a puddle is in the same place twice');
  ok(puddleAt(hits[0], 200, 0.5) < puddleAt(hits[0], 200, 1), 'and it is deeper in a heavier storm');
}

group('weather — the sky it paints');
{
  const w = new Weather({ seed: 2, state: 'storm' });
  const clone = (e) => ({ sky: e.sky.slice(), ground: e.ground.slice(), sun: e.sun.slice(), lightDir: e.lightDir.slice(), fog: e.fog.slice(), fogDensity: e.fogDensity });
  const day = clone(TIME_OF_DAY.day);
  const stormy = w.tintEnv(clone(TIME_OF_DAY.day));
  const lum = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
  ok(lum(stormy.sky) < lum(day.sky) * 0.6, 'a storm takes the sky down');
  ok(stormy.sky[1] >= stormy.sky[2] - 0.02, 'and it goes green-grey, not blue');
  ok(stormy.fogDensity > day.fogDensity * 2, 'you cannot see across the river');
  // world.js decides headlights from the sky's luminance, so this is the test
  // that a thunderstorm at two in the afternoon turns the lights on.
  const { nightAmount } = await import('../src/game/world.js');
  ok(nightAmount(stormy) > 0.15, 'a storm is dark enough for headlights');
  ok(nightAmount(day) === 0, '…and an ordinary afternoon is not');

  const hazy = new Weather({ seed: 2, state: 'haze' }).tintEnv(clone(TIME_OF_DAY.day));
  ok(hazy.fogDensity > day.fogDensity * 1.8, 'heat haze thickens the air');
  ok(lum(hazy.sky) > lum(stormy.sky) * 1.5, '…without turning the lights out');
}

group('weather — lightning and no DOM');
{
  const w = new Weather({ seed: 11, state: 'storm' });
  let flashes = 0, thunder = 0;
  const realFlash = w._playThunder.bind(w);
  w._playThunder = (p) => { thunder++; return realFlash(p); };
  let wasLit = false;
  for (let i = 0; i < 2400; i++) {
    w.update(0.25, { mode: 'drive', veh: { x: 0, z: 0, speedKmh: 60, vLong: 16 }, cam: 0 });
    if (w.flash > 0.2 && !wasLit) { flashes++; wasLit = true; }
    if (w.flash <= 0.01) wasLit = false;
  }
  ok(flashes > 4, `${flashes} strikes in ten minutes of storm`);
  ok(thunder >= flashes, `${thunder} rolls of thunder followed them`);
  const clear = new Weather({ seed: 11, state: 'clear' });
  let clearFlash = 0;
  for (let i = 0; i < 600; i++) { clear.update(0.25); if (clear.flash > 0.2) clearFlash++; }
  eq(clearFlash, 0, 'and no lightning out of a blue sky');
  ok(true, 'the whole thing runs with no document and no AudioContext');
}

// ---------------------------------------------------------------- 5. radio

group('the radio dial');
{
  ok(STATIONS.length >= 6, `${STATIONS.length} synthesised stations`);
  ok(STATION_NAMES[0].startsWith('CKOI'), `station 0 is still ${STATION_NAMES[0]}`);
  eq(STATION_NAMES[STATION_NAMES.length - 1], TAPE_NAME, 'the tape deck is the far end of the dial');
  eq(new Set(STATIONS.map((s) => s.id)).size, STATIONS.length, 'every station has its own id');
  eq(new Set(STATIONS.map((s) => s.name)).size, STATIONS.length, '…and its own name');
  for (const s of STATIONS) {
    ok(s.tracks.length >= 3, `${s.name}: ${s.tracks.length} tracks`);
    ok(s.tracks.every((t) => STYLES.some((y) => y.id === t.style)),
      `${s.name}: every track has a style to render`);
    ok(s.tracks.every((t) => t.seconds >= 90 && t.seconds <= 120), `${s.name}: tracks run 90-120 s`);
    ok(s.tracks.every((t) => t.title && t.artist), `${s.name}: everything has a title and an artist`);
    ok(s.idents.length >= 2, `${s.name}: ${s.idents.length} station idents`);
    ok(s.patter.length >= 3, `${s.name}: ${s.patter.length} lines of DJ`);
    ok(s.ads.length >= 3, `${s.name}: ${s.ads.length} ad reads`);
    ok(Array.isArray(s.sting) && s.sting.length >= 2, `${s.name} has its own sting`);
    ok(s.tone && s.tone.freq > 0, `${s.name} has its own speaker`);
    ok(typeof s.slogan === 'string' && s.slogan.length > 0, `${s.name}: « ${s.slogan} »`);
  }
  // Every advertiser is a place you can actually drive to.
  const labels = Object.values(PLACES).map((p) => (p.label || '').toLowerCase());
  const known = (txt) => labels.some((l) => {
    const word = l.split(/[,(]/)[0].trim();
    return word.length > 3 && txt.toLowerCase().includes(word.slice(0, Math.min(word.length, 14)));
  });
  for (const s of STATIONS) {
    const real = s.ads.filter(known).length;
    ok(real >= 2, `${s.name}: ${real} of ${s.ads.length} ads are for real places in this game`);
  }
  const weak = STATIONS.filter((s) => s.weak);
  eq(weak.length, 1, 'exactly one station you have to drive for');
  eq(weak[0].id, 'chez', '…and it is the Ottawa one');
  eq(new Set(STYLES.map((s) => s.id)).size, STYLES.length, 'no duplicate styles');
  ok(STYLES.length >= 8, `${STYLES.length} styles to render: ${STYLES.map((s) => s.name).join(', ')}`);
  eq(CKOI_TRACKS, STATIONS[0].tracks, 'CKOI_TRACKS is still CKOI’s playlist');
  ok(BREAK_SECONDS >= 4 && BREAK_SECONDS <= 12, 'a break is a few seconds of DJ, not a coffee');
}

group('the radio deck');
{
  localStorage.clear();
  const r = new Radio(null);           // no AudioContext: the dial still works
  ok(!r.wantOn, 'the deck starts off');
  r.toggle();
  eq(r.station, 0, 'R turns it on at CKOI');
  ok(r.wantOn, '…and on');
  for (let i = 1; i < STATIONS.length; i++) {
    r.toggle();
    eq(r.station, i, `R walks the dial to ${STATION_NAMES[i]}`);
  }
  r.toggle();
  ok(!r.wantOn, 'and past the last one it goes off again');
  ok(!r.tapeReady, 'with nothing in assets/radio/, the tape deck is not on the dial');
  eq(r.count, STATIONS.length, `${r.count} stations without a tape`);
  r.tapeReady = true;
  eq(r.count, STATIONS.length + 1, '…and one more with one');

  r.tune('chez');
  eq(r.state().stationName, 'CHEZ 106.1', 'tune() takes a station id');
  // The Ottawa signal. Downtown Hull is fine; the Aylmer marina is not.
  r.setPos(9510, -3364);
  for (let i = 0; i < 200; i++) r._signal(0.1);
  const hull = r.signal;
  r.setPos(-1766, -88);
  for (let i = 0; i < 400; i++) r._signal(0.1);
  const marina = r.signal;
  ok(hull > 0.75, `CHEZ comes in downtown Hull (${hull.toFixed(2)})`);
  ok(marina < 0.25, `and is mush at the marina (${marina.toFixed(2)})`);
  r.tune('ckoi');
  r._signal(0.1);
  eq(r.signal, 1, 'a local station is always full strength');

  // The break: idents, DJ, ads, and then the song comes back.
  r.tune('cjrc');
  const st = STATIONS.find((s) => s.id === 'cjrc');
  const seen = { ident: 0, dj: 0, ad: 0 };
  for (let i = 0; i < 12; i++) {
    r._openBreak();
    if (st.idents.includes(r.breakLine)) seen.ident++;
    else if (st.patter.includes(r.breakLine)) seen.dj++;
    else if (st.ads.includes(r.breakLine)) seen.ad++;
  }
  ok(seen.ident > 0 && seen.dj > 0 && seen.ad > 0,
    `breaks rotate: ${seen.ident} idents, ${seen.dj} DJ, ${seen.ad} ads`);
  ok(r.state().onBreak, 'and the HUD line is the DJ while one is running');
  eq(r.state().track, r.breakLine, '…not the song');
  r.breakT = 0;
  ok(!r.state().onBreak, 'the break ends');
  ok(r.state().track.includes('—') || r.state().track.length > 0, 'and the song comes back');
}

group('the cassette deck still works');
{
  // The one network path in the radio, and it is for the player's own files.
  const src = fs.readFileSync(path.join(ROOT, 'src/game/radio.js'), 'utf8');
  ok(/assets\/radio\//.test(src), 'the tape path is where it always was');
  ok(/playlist\.json/.test(src), 'and it is still driven by playlist.json');
  ok(fs.existsSync(path.join(ROOT, 'assets/radio/README.md')), 'assets/radio/README.md is there');
  ok(fs.existsSync(path.join(ROOT, 'assets/radio/playlist.example.json')), '…and the example playlist');
  const doc = src.slice(0, src.indexOf('import '));
  ok(/playlist\.json/.test(doc) && /assets\/radio/.test(doc),
    'the file header documents the cassette path');
  ok(/no network requests except the tape/.test(doc), 'and says it is the only fetch');

  const r = new Radio(null);
  const fakeFetch = (body, okFlag = true) => async () => ({ ok: okFlag, json: async () => body });
  const real = globalThis.fetch;
  globalThis.fetch = fakeFetch(['un.mp3', 'deux.ogg']);
  ok(await r.loadTape() === true, 'a bare array of filenames loads');
  eq(r.tape.list.map((x) => x.file), ['un.mp3', 'deux.ogg'], 'and becomes the tape');
  eq(r.tape.list[0].title, 'un', 'a filename becomes a title');
  const r2 = new Radio(null);
  globalThis.fetch = fakeFetch({ tracks: [{ file: 'a.mp3', title: 'A', artist: 'B' }] });
  ok(await r2.loadTape() === true, 'the {tracks:[...]} form loads too');
  eq(r2._tapeTrack().artist, 'B', 'with its artist');
  const r3 = new Radio(null);
  globalThis.fetch = fakeFetch([], true);
  ok(await r3.loadTape() === false, 'an empty playlist leaves the deck off the dial');
  const r4 = new Radio(null);
  globalThis.fetch = fakeFetch(null, false);
  ok(await r4.loadTape() === false, 'and so does a 404');
  const r5 = new Radio(null);
  globalThis.fetch = async () => { throw new Error('offline'); };
  ok(await r5.loadTape() === false, 'a thrown fetch never escapes');
  globalThis.fetch = real;
}

// ---------------------------------------------------------------- 6. the copy
//
// assets/text/heckles.json and assets/text/radio.json are written content that
// arrives beside the code. Both are loaded at runtime with a built-in fallback,
// so these tests check the wiring AND that the files still say what the wiring
// expects — the failure mode of written content is that lines quietly stop
// being reachable.

const TEXT = path.join(ROOT, 'assets/text');
const haveText = fs.existsSync(path.join(TEXT, 'heckles.json'));

group('the written heckles');
if (!haveText) ok(false, 'assets/text/heckles.json is present');
else {
  const json = JSON.parse(fs.readFileSync(path.join(TEXT, 'heckles.json'), 'utf8'));
  const pools = ingestHeckles(json);
  ok(!!pools, 'the file ingests');
  eq(Object.keys(pools).sort(), [...JSON_TRIGGERS].sort(),
    'the file’s triggers are exactly the ones heckle.js knows about');
  for (const k of JSON_TRIGGERS) ok(pools[k].length >= 20, `${k}: ${pools[k].length} written lines`);
  const total = Object.values(pools).reduce((n, p) => n + p.length, 0);
  ok(total >= 300, `${total} lines in all`);
  // Every one of them translates, and every one explains itself.
  let noEn = 0, noNote = 0;
  for (const r of json.heckles) { if (!r.en) noEn++; if (!r.note) noNote++; }
  eq(noEn, 0, 'every written line has an English gloss');
  eq(noNote, 0, 'every written line has a note explaining it');
  // ...and the gloss lookup finds them once they are ingested, which is what
  // the G key reads.
  const sample = json.heckles[0];
  eq(glossOf(sample.fr), sample.en, 'glossOf() finds a written line’s English');
  eq(noteOf(sample.fr), sample.note, '…and its note');

  // The wiring. Five triggers arrive through the alias table because something
  // was already firing them; the other seven are fired by main.js.
  const aliased = Object.values(TRIGGER_ALIAS).filter(Boolean);
  eq(aliased.sort(), ['cops', 'hitcar', 'honked', 'nearmiss', 'ranred'],
    'five triggers reach the old call sites through the alias');
  const direct = JSON_TRIGGERS.filter((k) => !aliased.includes(k));
  eq(direct.sort(), ['bigair', 'hitprop', 'reversing', 'sidewalk', 'speeding', 'stuck', 'wrongway'],
    'and seven are fired by main.js');
  for (const k of direct) {
    ok(new RegExp(`heckle\\.say\\([^)]*'${k}'`).test(MAIN), `main.js fires « ${k} »`);
  }
  // The four pools with no written counterpart keep their built-in lines.
  for (const k of ['parked', 'rival', 'clean']) {
    eq(TRIGGER_ALIAS[k], null, `« ${k} » has no written counterpart and says so`);
    ok(HECKLES[k].length >= 5, `…and keeps its ${HECKLES[k].length} built-in lines`);
  }

  // A Heckle with the corpus loaded draws from it; without one, from the pools.
  const h = new Heckle();
  h.bind({ settings: { ...DEFAULT_SETTINGS } });
  ok(HECKLES.dive.includes(h.poolFor('dive')[0]), 'with no corpus, dive is the built-in pool');
  h.pools = pools;
  ok(pools.nearmiss.includes(h.poolFor('dive')[0]), 'with one, dive draws from nearmiss');
  ok(HECKLES.parked.includes(h.poolFor('parked')[0]), 'and parked still draws from the built-ins');
  ok(pools.wrongway.includes(h.poolFor('wrongway')[0]), 'a written-only trigger resolves');
  const said = h.say('Chauffeur', 'wrongway');
  ok(pools.wrongway.includes(said), `a written line goes out: « ${said} »`);
  ok(glossOf(said).length > 0, '…and it translates');
}

group('the written radio');
if (!fs.existsSync(path.join(TEXT, 'radio.json'))) ok(false, 'assets/text/radio.json is present');
else {
  const json = JSON.parse(fs.readFileSync(path.join(TEXT, 'radio.json'), 'utf8'));
  const dial = stationsFromJSON(json);
  ok(!!dial, 'the file builds a dial');
  eq(dial[0].id, 'ckoi', 'CKOI keeps position 0 — it shipped first and a test pins it');
  eq(dial.length, json.stations.length + 1, `${dial.length} stations on the loaded dial`);
  for (const r of json.stations) {
    ok(!!MUSIC[r.id], `${r.call} has music of its own`);
    const st = dial.find((s) => s.id === r.id);
    ok(!!st, `${r.call} made it onto the dial as « ${st && st.name} »`);
    ok(st.tracks.length >= 3, `${st.name}: ${st.tracks.length} songs`);
    ok(st.tracks.every((t) => STYLES.some((y) => y.id === t.style)), `${st.name}: every song renders`);
    ok(st.idents.length === 8 && st.patter.length === 25 && st.ads.length === 12,
      `${st.name}: ${st.idents.length} idents, ${st.patter.length} patter, ${st.ads.length} ads`);
    ok(st.stingers.length === 6 && st.contests.length === 4,
      `${st.name}: ${st.stingers.length} stingers, ${st.contests.length} contests`);
    ok(st.ads.every((a) => a.business && a.copy), `${st.name}: every ad names its advertiser`);
  }
  // The one naming inconsistency the copy had: 104.7 is CFOU on the licence and
  // MAX on the air, and dialogue.json says MAX. The brand wins on the HUD.
  const max = dial.find((s) => s.id === 'max_energie');
  eq(max.name, 'MAX 104.7', '104.7 is MAX on the HUD, the way the DJ and the dialogue both say it');
  ok(max.slogan.includes('CFOU'), '…with the call sign kept in the slogan');
  const dlg = path.join(TEXT, 'dialogue.json');
  if (fs.existsSync(dlg)) {
    const txt = fs.readFileSync(dlg, 'utf8');
    if (/104\.7/.test(txt)) ok(/MAX 104\.7/.test(txt), 'and the dialogue agrees');
  }
  // Only the Ottawa station fades.
  eq(dial.filter((s) => s.weak).map((s) => s.id), ['the_buzz_ottawa'],
    'exactly one station you have to drive for, and it is the Ottawa one');
  // AM sounds like AM.
  const am = dial.find((s) => s.id === 'cjrc_talk');
  ok(am.tone.q > 2, `CJRC comes out of an AM speaker (Q ${am.tone.q})`);

  // An ad read is a paragraph, so it goes out a line at a time.
  const long = json.stations[0].ads[0].copy;
  const chunks = chunkCopy(long);
  ok(chunks.length >= 3, `a ${long.length}-character ad read becomes ${chunks.length} lines`);
  ok(chunks.every((c) => c.length <= AD_CHUNK * 1.7), 'and none of them overflows the HUD');
  eq(chunks.join(' ').replace(/\s+/g, ' '), long.replace(/\s+/g, ' '), 'without losing a word of it');

  // The deck, driven off the loaded dial.
  localStorage.clear();
  const r = new Radio(null);
  r.dial = dial;
  r.tune('max_energie');
  eq(r.state().stationName, 'MAX 104.7', 'tune() finds a written station');
  const seen = new Set();
  for (let i = 0; i < 32; i++) { r._openBreak(); seen.add(r.breakLine.slice(0, 4)); }
  ok(seen.size > 4, `${seen.size} different break openings in eight rotations`);
  r._openBreak();
  const before = r.breakLine;
  // Walk one whole ad break out through update().
  r.station = r.dial.findIndex((s) => s.id === 'max_energie');
  r.breakIdx = 2;                         // the ad slot
  r._openBreak();
  ok(r.breakLine.startsWith('PUB — '), `an ad break opens with the advertiser: « ${r.breakLine} »`);
  ok(r.breakQueue.length >= 3, `…and has ${r.breakQueue.length} lines of copy behind it`);
  ok(typeof before === 'string', 'breaks keep producing lines');
  r.tune('cjrc_talk');
  eq(r.breakQueue.length, 0, 'changing station drops the break you were in');
}

// ---------------------------------------------------------------- report

console.log('\n' + (fail ? `FAILED  ${fail} of ${pass + fail}` : `ok  ${pass} assertions`));
if (fail) {
  for (const f of fails) console.log('  - ' + f);
  process.exit(1);
}
