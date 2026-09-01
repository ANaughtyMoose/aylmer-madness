// Avatars agent smoke test:  node tools/smoke_avatars.mjs
//
// Two of the friends are real people, so this file guards the things that would
// make them stop being recognisable without anyone noticing:
//
//   * both meshes build, in both modes, at a sane triangle count and a sane
//     human size — a caricature is allowed a big head, not a two-metre one
//   * the seated meshes still swallow main.js's anonymous passenger head, or it
//     pokes out through their face
//   * riders() reads the right person out of the `gang` job's stages, for both
//     the three-seat car and the two-seat Ranger that has to do the run twice
//   * nothing anywhere surfaces the historical `steph` / `marc` / `dave` keys
//   * the driveway lines are French, in bubbles, and nobody is left mute
//
// No browser and no WebGL: every build function returns a plain MeshBuilder.
import { MAP } from '../src/game/mapdata.js';
import { PLACES, resolvePlaces } from '../src/game/places.js';
import { MISSIONS } from '../src/game/missions.js';
import { CARS, carById } from '../src/game/cars.js';
import {
  GREETINGS, greeting, DIALOGUE, DIALOGUE_FILES, applyDialogue, personLine,
} from '../src/game/story.js';
import {
  AMBIENT, POLICE_CHATTER, applyAmbient, ambientLine, zoneAt,
} from '../src/game/peds.js';
import fs from 'node:fs';
import {
  buildSayyad, buildSayyadArm, buildMargaret, buildMargaretArm,
  buildMike, buildMikeArm, buildZahra,
  CAST, FRIEND_AT, riders, standSpot, Avatars, DRAW_R,
} from '../src/game/avatars.js';

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  — ' + extra : '')); }
};
const group = (n) => console.log('\n' + n);

// Just enough world for resolvePlaces() — the same stub the story suite uses.
const world = {
  nearestRoad(x, z) {
    let best = null, bd = Infinity;
    for (const r of MAP.roads) {
      for (let i = 0; i + 1 < r.pts.length; i++) {
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
        const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1e-6;
        const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
        const px = ax + ex * t, pz = az + ez * t;
        const d = Math.hypot(px - x, pz - z);
        if (d < bd) { bd = d; best = { x: px, z: pz, yaw: Math.atan2(ex, ez), name: r.name }; }
      }
    }
    return best;
  },
};
resolvePlaces(world);

const tris = (b) => b.i.length / 3;
const size = (b) => [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];

// ------------------------------------------------------------------ meshes

group('meshes build, and are people-shaped');
const builds = {
  'Sayyad standing': buildSayyad('stand'),
  'Sayyad seated': buildSayyad('seat'),
  'Sayyad arm': buildSayyadArm(),
  'Margaret standing': buildMargaret('stand'),
  'Margaret seated': buildMargaret('seat'),
  'Margaret arm': buildMargaretArm(),
  'Mike standing': buildMike('stand'),
  'Mike seated': buildMike('seat'),
  'Mike arm': buildMikeArm(1),
  'Zahra standing': buildZahra('stand'),
};
for (const [name, b] of Object.entries(builds)) {
  const t = tris(b);
  ok(t > 0, name + ' has geometry');
  ok(t <= 600, name + ` is ${t} tris (<= 600)`, String(t));
  const [w, h, d] = size(b);
  ok(w < 1.4 && h < 2.2 && d < 1.4, name + ` bounds ${w.toFixed(2)}x${h.toFixed(2)}x${d.toFixed(2)} m`);
  for (const v of [...b.min, ...b.max]) ok(Number.isFinite(v), name + ' bounds are finite');
}

group('standing bodies are the right height, and the right height apart');
for (const [who, lo, hi] of [
  ['Sayyad', 1.70, 1.95], ['Margaret', 1.60, 1.85],
  ['Mike', 1.70, 1.95], ['Zahra', 1.55, 1.80],
]) {
  const b = builds[who + ' standing'];
  ok(b.min[1] >= -0.01 && b.min[1] < 0.05, who + ' stands on the ground', String(b.min[1]));
  ok(b.max[1] > lo && b.max[1] < hi, `${who} is ${b.max[1].toFixed(2)} m tall`);
}
ok(builds['Sayyad standing'].max[1] - builds['Margaret standing'].max[1] > 0.06,
  'Sayyad is visibly taller than Margaret');
ok(builds['Margaret standing'].max[1] - builds['Zahra standing'].max[1] > 0.03,
  'Zahra is the shortest of the four');

// The comedy is in the head, so the head is allowed to be big — but a head that
// is more than a third of the body has stopped being a caricature.
group('caricature proportions');
for (const who of ['Sayyad', 'Margaret', 'Mike']) {
  const seat = builds[who + ' seated'];
  const stand = builds[who + ' standing'];
  const head = seat.max[1] - 0.02;               // seated origin is the head centre
  ok(head / stand.max[1] > 0.10 && head / stand.max[1] < 0.35,
    `${who}'s head is ${(head / stand.max[1] * 100) | 0}% of him`);
}

// main.js still draws buildHead() at every occupied seat: a 0.30 x 0.34 x 0.28
// skin box centred on the seat point with a 0.32 x 0.14 x 0.30 hair box on top.
// The seated meshes have to reach past all of it or it shows through the face.
group('the seated meshes swallow the anonymous passenger head');
for (const who of ['Sayyad', 'Margaret', 'Mike']) {
  const b = builds[who + ' seated'];
  ok(b.min[0] <= -0.16 && b.max[0] >= 0.16, who + ' covers it across');
  ok(b.min[1] <= -0.17 && b.max[1] >= 0.27, who + ' covers it top to bottom',
    `${b.min[1].toFixed(3)}..${b.max[1].toFixed(3)}`);
  ok(b.min[2] <= -0.15 && b.max[2] >= 0.15, who + ' covers it front to back');
}

group('the shirt is open and the fronds are on it');
{
  // Every colour that reaches the buffer, as hex, so "is the palm print there"
  // is a question this file can actually answer.
  const cols = new Set();
  const b = builds['Sayyad standing'];
  for (let i = 0; i < b.v.length; i += 9) {
    const hex = [b.v[i + 6], b.v[i + 7], b.v[i + 8]]
      .map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
    cols.add(hex);
  }
  ok(cols.has('c4285f') || cols.has('e2568d'), 'magenta palm fronds are in the mesh');
  ok(cols.has('d8d4cb'), 'wire glasses are in the mesh');
  ok(cols.has('a9a49c'), 'grey temples are in the mesh');
  ok(cols.has('8d1c22'), 'the red terry shorts are in the mesh');

  const cm = new Set();
  const g = builds['Margaret standing'];
  for (let i = 0; i < g.v.length; i += 9) {
    const hex = [g.v[i + 6], g.v[i + 7], g.v[i + 8]]
      .map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
    cm.add(hex);
  }
  ok(cm.has('ffffff'), 'white hair is in the mesh');
  ok(cm.has('f7f3ea'), 'the smile has teeth in it');
  ok(cm.has('596069') && cm.has('79826f'), 'the fleece and its pouch are round her waist');
  ok(cm.has('1a2236'), 'the navy tee is in the mesh');

  const hex = (b) => {
    const out = new Set();
    for (let i = 0; i < b.v.length; i += 9) {
      out.add([b.v[i + 6], b.v[i + 7], b.v[i + 8]]
        .map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join(''));
    }
    return out;
  };
  const ck = hex(builds['Mike standing']);
  ok(ck.has('eeeae2') && ck.has('8a7360'), 'Mike wears a white shirt with pinstripes on it');
  ok(ck.has('211d1c'), 'the thin dark frames are in the mesh');
  ok(ck.has('5a4230') || ck.has('6d5340'), 'the brown hair is in the mesh');
  ok(hex(buildMikeArm(1)).has('e9bd9b'), 'his hands are on the arm mesh, not the body');
  const cz = hex(builds['Zahra standing']);
  ok(cz.has('241d1a'), 'Zahra has the long dark hair');
  ok(cz.has('2c3036') && cz.has('777d86'), '...and the headphones');
}

// ------------------------------------------------------------------ the cast

group('who stands where');
ok(CAST.sayyad.home === 'steph', 'Sayyad waits at 75 Denise-Friend');
ok(CAST.margaret.home === 'margaret', 'Margaret waits at 299 Chemin Fraser');
ok(CAST.mike.home === 'mike', 'Mike waits at 129 Frank-Robinson');
ok(CAST.zahra.home === 'steph' && CAST.zahra.along > 2,
  'Zahra waits at her brother\'s, up the kerb from him');
ok(CAST.zahra.seatless, 'and she never gets in');
for (const who of Object.keys(CAST)) {
  const s = standSpot(who);
  const p = PLACES[CAST[who].home];
  ok(s && Number.isFinite(s.x) && Number.isFinite(s.z), who + ' has a spot');
  // Off the road, but still deep inside the 13 m pickup circle. `along` slides
  // Zahra up the kerb from her brother, so hers is the longer leg of a triangle.
  const d = Math.hypot(s.x - p.x, s.z - p.z);
  const lo = 4, hi = CAST[who].along ? 11 : 8;
  ok(d > lo && d < hi, `${who} stands ${d.toFixed(1)} m off the kerb, on the lawn`);
  ok(Number.isFinite(s.yaw), who + ' faces the road');
}
ok(Math.hypot(standSpot('sayyad').x - standSpot('margaret').x,
  standSpot('sayyad').z - standSpot('margaret').z) > 500,
  'Sayyad and Margaret do not live in the same driveway');
{
  const a = standSpot('sayyad'), b = standSpot('zahra');
  const d = Math.hypot(a.x - b.x, a.z - b.z);
  ok(d > 3 && d < 9, `brother and sister stand ${d.toFixed(1)} m apart, not inside each other`);
}

group('the animation table');
for (const who of Object.keys(CAST)) {
  const c = CAST[who];
  const o = { bob: 0, roll: 0, yaw: 0, arm: [0, 0, 0, 0] };
  ok(typeof c.idle === 'function', who + ' has an idle');
  ok(Array.isArray(c.arms), who + ' declares its arms');
  ok(c.arms.length * 2 <= o.arm.length, who + ' fits the pose record');
  let moved = false, sane = true;
  for (let i = 0; i < 400; i++) {
    c.idle(i * 0.04, o);
    for (const v of [o.bob, o.roll, o.yaw, ...o.arm]) {
      if (!Number.isFinite(v)) sane = false;
    }
    if (Math.abs(o.bob) > 0.4 || Math.abs(o.roll) > 1 || Math.abs(o.yaw) > 1) sane = false;
    if (Math.abs(o.bob) + Math.abs(o.roll) + Math.abs(o.yaw)
      + o.arm.reduce((a, v) => a + Math.abs(v), 0) > 0.02) moved = true;
  }
  ok(sane, who + ' stays finite and in range for sixteen seconds');
  ok(moved, who + ' is not a statue');
  for (const a of c.arms) {
    ok(Array.isArray(a.at) && a.at.length === 3 && a.at.every(Number.isFinite),
      who + ' hangs an arm off a real shoulder');
    const m = a.build();
    ok(m.i.length / 3 > 0 && m.i.length / 3 <= 200, who + ` arm is ${m.i.length / 3} tris`);
  }
}

group('riders() — who is actually in the truck');
const ctxFor = (id) => {
  const spec = carById(id);
  return { seats: spec.seats, carName: spec.name, carId: id, spec };
};
const gang = MISSIONS.find((m) => m.id === 'gang');
ok(!!gang, 'the gang job still exists');
for (const carId of ['ranger', 'saturn']) {
  const stages = gang.build(ctxFor(carId));
  const label = `${carId} (${carById(carId).seats} seats)`;
  const seen = [];
  for (let idx = 0; idx <= stages.length; idx++) {
    seen.push(riders({ mission: { stages, idx } }).slice());
  }
  ok(seen[0].length === 0, label + ': nobody aboard before the first pickup');
  // Margaret is always the first pickup, and Sayyad is always the second.
  ok(seen[1][0] === 'margaret', label + ': Margaret gets in first', JSON.stringify(seen[1]));
  ok(seen[2][0] === 'margaret' && seen[2][1] === 'sayyad',
    label + ': then Sayyad', JSON.stringify(seen[2]));
  ok(seen[seen.length - 1].length === 0, label + ': everybody is out at the end',
    JSON.stringify(seen[seen.length - 1]));
  for (const r of seen) {
    ok(r.length <= carById(carId).seats, label + ': never more riders than seats');
    ok(r.every((w) => w === null || CAST[w]), label + ': every rider is somebody we can draw');
  }
}
ok(riders({}).length === 0 && riders({ mission: null }).length === 0,
  'riders() copes with no job running');
ok(riders({ mission: { stages: [{ passengers: 1, at: 'mall' }], idx: 1 } })[0] === null,
  'an unknown pickup rides anonymously');

group('every pickup stage in the game maps to somebody, or to nobody on purpose');
for (const def of MISSIONS) {
  for (const carId of ['ranger', 'saturn']) {
    for (const st of def.build(ctxFor(carId))) {
      if (!(st.passengers > 0) || typeof st.at !== 'string') continue;
      const who = FRIEND_AT[st.at];
      ok(who === undefined || !!CAST[who],
        `${def.id}: pickup at ${st.at} -> ${who || 'anonymous'}`);
    }
  }
}

group('the placeholder ids never reach the player');
for (const who of Object.keys(CAST)) {
  ok(!/steph|marc|dave/i.test(CAST[who].name), CAST[who].name + ' is a real name');
}
for (const [who, pool] of Object.entries(GREETINGS)) {
  for (const line of pool) {
    ok(!/\bsteph\b|\bmarc\b|\bdave\b/i.test(line), `no placeholder name in: ${line.slice(0, 40)}…`);
  }
}

group('the driveway lines');
for (const who of Object.keys(CAST)) {
  const pool = GREETINGS[who];
  ok(pool && pool.length >= 3, who + ' has at least three things to say');
  for (const line of pool) {
    ok(line.startsWith('« ') && line.endsWith(' »'), 'quoted like the rest: ' + line.slice(0, 30));
    ok(!/["']/.test(line), 'typographic apostrophes only: ' + line.slice(0, 30));
  }
  // Accents per line would be a lie — « Attends, je mets mon coton » has none
  // and is still the most Québécois sentence in the file. Per pool it holds.
  ok(/[àâçéèêëîïôùûüÀÂÇÉÈÊÎÔÙÛ]/.test(pool.join(' ')), who + ' speaks accented French');
  ok(greeting(who, 0) === pool[0] && greeting(who, pool.length) === pool[0],
    who + ': greeting() wraps');
}
ok(greeting('nobody') === null, 'greeting() of a stranger is null');

group('the draw loop survives a headless renderer');
{
  // No WebGL here, so Avatars is built with a null renderer and its meshes are
  // null; draw() has to be a no-op rather than a crash, which is also what
  // happens in main.js on the frames before the meshes exist.
  const a = new Avatars(null);
  const G = { mission: null, veh: { x: 0, z: 0, yaw: 0, spec: carById('ranger'), vLong: 0 } };
  const r = { n: 0, draw() { this.n++; } };
  let threw = null;
  try { a.draw(r, { x: 0, z: 0 }, G, 0.016); } catch (e) { threw = e; }
  ok(!threw, 'draw() with no meshes does not throw', threw && threw.message);
  ok(r.n === 0, 'and draws nothing');
  // riders() writes into the array the draw loop owns, so a frame allocates
  // nothing; the same array coming back is the whole point.
  const buf = [];
  ok(riders({ mission: { stages: [{ passengers: 1, at: 'home' }], idx: 1 } }, buf) === buf
    && buf.length === 1 && buf[0] === 'margaret', 'riders() fills a caller array');
  riders({}, buf);
  ok(buf.length === 0, 'and clears it');
  ok(a.draw(r, null, G, 0.016) === 0, 'no focus, no draws');
  ok(DRAW_R > 60 && DRAW_R < 400, 'the cull radius is sane');
  const s = a.spotFor('sayyad');
  ok(s && a.spotFor('sayyad') === s, 'stand spots are cached');
}

// ------------------------------------------------------- the text files
//
// The lines are data now (assets/text/*.json), loaded at runtime with the
// pools in story.js and peds.js as the fallback. Node has no fetch for a local
// file, so this drives the pure half — applyDialogue / applyAmbient — with the
// real files read off disk, which is the same thing the browser feeds them.

group('assets/text/*.json fold in without a browser');
{
  const read = (n) => {
    try { return JSON.parse(fs.readFileSync(new URL('../assets/text/' + n, import.meta.url), 'utf8')); }
    catch { return null; }
  };
  // The fallbacks have to stand on their own: the game runs with no files.
  for (const who of ['Sayyad', 'Margaret', 'Adam', 'Ton père']) {
    ok(!!personLine(who, 'start') && !!personLine(who, 'end'),
      who + ' has a fallback line before anything loads');
  }
  ok(personLine('Personne') === null, 'and a stranger has none');

  let n = 0;
  for (const f of DIALOGUE_FILES) {
    const j = read(f);
    ok(!!j, f + ' parses');
    if (!j) continue;
    n += applyDialogue(j);
  }
  ok(n >= 96, `${n} lines folded in from ${DIALOGUE_FILES.length} files`);
  ok(applyDialogue(null) === 0 && applyDialogue({}) === 0, 'a missing file takes nothing');

  for (const who of ['Sayyad', 'Margaret', 'Adam', 'Ton père', 'Zahra']) {
    for (const when of ['start', 'end']) {
      const pool = DIALOGUE[who][when];
      ok(pool.length >= 12, `${who} has ${pool.length} ${when} lines`);
      for (const l of pool) {
        ok(l.startsWith('« ') && l.endsWith(' »'), 'quoted: ' + l.slice(0, 34));
        ok(!/'/.test(l), 'typographic apostrophes: ' + l.slice(0, 34));
      }
      // Rotation, not repetition: the pool comes back in order and wraps.
      ok(personLine(who, when, 0) === pool[0]
        && personLine(who, when, pool.length) === pool[0], who + ' ' + when + ' rotates');
    }
  }
  ok(DIALOGUE.Zahra['about-sayyad'].length >= 8,
    'Zahra keeps her about-sayyad set instead of it being folded into start');
  ok(/104\.7/.test(DIALOGUE.Sayyad.start.join(' ')), 'Sayyad still names the station');
}

group('overheard street life');
{
  const j = (() => {
    try { return JSON.parse(fs.readFileSync(new URL('../assets/text/ambient.json', import.meta.url), 'utf8')); }
    catch { return null; }
  })();
  ok(!!j, 'ambient.json parses');
  ok(AMBIENT.length >= 5, 'there is a fallback pool before it loads');
  ok(!!ambientLine('residential', 'morning'), 'and the fallback answers a query');
  const n = applyAmbient(j);
  ok(n >= 100, `${n} overheard lines`);
  ok(POLICE_CHATTER.length >= 50,
    `${POLICE_CHATTER.length} police lines exported for whoever owns the cruiser`);
  ok(applyAmbient(null) === 0, 'a missing file takes nothing');

  const wheres = new Set(AMBIENT.map((r) => r.where));
  for (const w of ['residential', 'commercial', 'beach', 'marina', 'park', 'downtown']) {
    ok(wheres.has(w), 'lines exist for ' + w);
  }
  // Every line keeps its English gloss: a translation hotkey is being built
  // elsewhere and it reads these records, not the file.
  ok(AMBIENT.every((r) => r.en && r.line), 'every line carries its gloss');

  // The real query: a place and a phase always produce something, and walking
  // the index walks the pool rather than sticking on one line.
  for (const w of ['residential', 'commercial', 'beach', 'marina', 'park', 'downtown']) {
    for (const phase of ['morning', 'day', 'dusk', 'night', 'nonsense']) {
      const seen = new Set();
      for (let i = 0; i < 6; i++) {
        const r = ambientLine(w, phase, i);
        ok(!!r && !!r.line, `${w}/${phase} has something to say`);
        if (r) seen.add(r.line);
      }
      ok(seen.size > 1, `${w}/${phase} does not repeat one line`);
    }
  }
  ok(!/\btu\b.*\bton char\b/i.test(AMBIENT.map((r) => r.line).join(' ')),
    'nothing overheard is addressed to the player');

  // Zones: the anchors resolve, and the middle of a subdivision is residential.
  ok(zoneAt(PLACES.beach.x, PLACES.beach.z) === 'beach', 'the beach is the beach');
  ok(zoneAt(PLACES.marina.x, PLACES.marina.z) === 'marina', 'the marina is the marina');
  ok(zoneAt(PLACES.mall.x, PLACES.mall.z) === 'commercial', 'the Galeries are commercial');
  ok(zoneAt(PLACES.principale.x, PLACES.principale.z) === 'downtown', 'the Vieux is downtown');
  ok(zoneAt(1e5, 1e5) === 'residential', 'and the middle of nowhere is residential');
}

group('every authored line has somewhere to be heard');
{
  // A pool nothing ever reaches is a writer's afternoon on the floor. Sayyad,
  // Margaret and Mike say theirs getting in and out; Zahra never rides, so
  // hers have to come out on the lawn instead.
  const heard = {
    Sayyad: ['start', 'end'], Margaret: ['start', 'end'],
    Zahra: ['start', 'about-sayyad'],
  };
  for (const [who, sets] of Object.entries(heard)) {
    for (const when of sets) {
      ok((DIALOGUE[who][when] || []).length > 0, `${who}/${when} is reachable`);
    }
  }
  ok(CAST.zahra.seatless && !!DIALOGUE.Zahra['about-sayyad'].length,
    'Zahra does not ride, so her lawn lines are the ones that run');
  // riders() only ever names somebody CAST can draw, so a boarding line can
  // never be looked up under a name nothing answers to.
  for (const who of Object.values(FRIEND_AT)) ok(!!CAST[who], who + ' is in the cast');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
