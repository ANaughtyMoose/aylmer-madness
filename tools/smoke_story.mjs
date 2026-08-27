// Story agent smoke test:  node tools/smoke_story.mjs
//
// GOAL A is a rule, not a feature: at every moment the HUD's two lines say what
// to do next and which key does it. That is only true if it is enforced, so
// this file is mostly an audit —
//
//   * every stage of every job, built for every car, has a `text`, a `sub` that
//     names a key, and a `hint` for when the player stops moving
//   * the free-roam lines are never « Free roam »: they name the nearest job you
//     have not done, how far it is, and the key
//   * the stuck detector fires at 20 s / 20 m and not before
//   * the opener is 3-4 cards and E walks through them
//   * the heckle pool is big and the limiter is mean
//
// No browser, no DOM: story.js and heckle.js both work without one.
import { MISSIONS } from '../src/game/missions.js';
import { PLACES, resolvePlaces } from '../src/game/places.js';
import { MAP } from '../src/game/mapdata.js';
import { CARS } from '../src/game/cars.js';
import { HINT_AFTER, stageHint } from '../src/game/missionkit.js';
import {
  STORY_CARDS, StoryOpener, FRIEND_LINES, friendLines,
  freeRoamLines, nearestJob, updateStuck, carUnderfoot, fmtDist,
  STUCK_M, STUCK_T,
} from '../src/game/story.js';
import {
  Heckle, HECKLES, SPEAKER, allLines, GAP, COOLDOWN, CLEAN_AFTER, CLEAN_MOVING,
} from '../src/game/heckle.js';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/game/store.js';
import { SECTIONS } from '../src/game/options.js';

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  — ' + extra : '')); }
};
const group = (n) => console.log('\n' + n);

// Just enough world for resolvePlaces(), so the distances below are the real
// snapped-to-the-kerb ones the game actually uses.
const B = MAP.bounds;
const fakeWorld = {
  bounds: B,
  waterAt: () => false,
  nearestRoad(x, z) {
    let bd = Infinity, best = { x, z, yaw: 0, name: '' };
    for (const r of MAP.roads) {
      for (let i = 0; i + 1 < r.pts.length; i++) {
        const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
        const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1e-6;
        const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
        const px = ax + ex * t, pz = az + ez * t;
        const d = Math.hypot(px - x, pz - z);
        if (d < bd) { bd = d; best = { x: px, z: pz, yaw: Math.atan2(ex, ez), name: r.name || '' }; }
      }
    }
    return best;
  },
};
resolvePlaces(fakeWorld);

// ---------------------------------------------------------------- 1. the audit

// A `sub` earns its place by naming the key that does the thing. Bare W / S /
// A / D count only as standalone words, so "chemin d'Aylmer" is not a D key.
const KEY_RE = /\bEspace\b|\bGPS\b|pilier|(?:^|[\s(«])[EWSAD](?:\/[EWSAD])?(?=[\s,.!:·)»]|$)/u;
export const namesAKey = (s) => KEY_RE.test(String(s || ''));

group('GOAL A — every stage says what to do and which key does it');
{
  let stages = 0, worst = null;
  for (const car of CARS) {
    const ctx = { carId: car.id, carName: car.name, seats: car.seats, money: 200 };
    for (const m of MISSIONS) {
      for (const st of m.build(ctx)) {
        stages++;
        const where = `${m.id} / ${car.id} “${String(st.text || '').slice(0, 34)}”`;
        if (!(typeof st.text === 'string' && st.text.trim())) { worst = where; }
        ok(typeof st.text === 'string' && st.text.trim().length > 0, `${where}: has a goal line`);
        ok(typeof st.sub === 'string' && st.sub.trim().length > 0, `${where}: has a how line`);
        ok(namesAKey(st.sub), `${where}: the how line names a key`, st.sub);
        ok(typeof st.hint === 'string' && st.hint.trim().length > 8,
          `${where}: has a hint for a lost player`, st.hint);
      }
    }
  }
  ok(stages > 100, `${stages} stage builds audited across ${MISSIONS.length} jobs and ${CARS.length} cars`);
  ok(worst === null, 'no stage anywhere is missing its goal line', worst || '');
}

group('the Sayyad job reads like instructions');
{
  const sayyad = MISSIONS.find((m) => m.id === 'sayyad');
  const [drive, donuts, escape] = sayyad.build({ carId: 'ranger', carName: 'Ranger', seats: 2, money: 80 });
  ok(/Sayyad/.test(drive.text) && /GPS/.test(drive.sub), 'stage 1 sends you there with the GPS', drive.sub);
  ok(/3 doughnuts/i.test(donuts.text) && /0\/3/.test(donuts.text),
    'stage 2 names the count in the objective', donuts.text);
  ok(/Espace/.test(donuts.sub) && /A\/D/.test(donuts.sub),
    'stage 2 names the handbrake and the wheel', donuts.sub);
  ok(/300 m/.test(escape.text) && /25 s/.test(escape.text),
    'stage 3 says how far and how long', escape.text);
  // ...and the live counter in the prompt.
  const meter = { count: 1, state: () => ({ sliding: false, progress: 0.4 }) };
  const line = donuts.prompt({}, { donut: { meter, grace: 5 } }, donuts);
  ok(/Doughnuts: 1\/3/.test(line) && /Espace/.test(line), 'the prompt counts live', line);
}

group('hints only whisper once you have been standing there');
{
  const st = { hint: 'par là' };
  ok(stageHint({ stageTime: 0 }, st) === null, `nothing for the first ${HINT_AFTER} s`);
  ok(stageHint({ stageTime: HINT_AFTER + 0.1 }, st) === 'Psst: par là', 'then « Psst: ... »');
  ok(stageHint({ stageTime: 99 }, {}) === null, 'a stage with no hint stays quiet');
}

// ---------------------------------------------------------------- 2. free roam

// The smallest G the guidance lines need.
function fakeG(x, z, done = [], parked = {}) {
  return {
    veh: { x, z, vLong: 0, speedKmh: 0, spec: { id: 'ranger' } },
    done: new Set(done),
    parked,
    settings: { ...DEFAULT_SETTINGS },
  };
}

group('GOAL A — free roam names the nearest job, its distance and the key');
{
  const home = PLACES.home;
  const G = fakeG(home.x + 40, home.z + 10);
  const l = freeRoamLines(G);
  ok(l.kind === 'job', 'standing at home, there is a job to point at');
  ok(!/free ?roam/i.test(l.text + l.sub), 'the words « Free roam » appear nowhere', l.text);
  ok(/^Prochaine job: /.test(l.text), 'the goal line is the job', l.text);
  ok(/\d+\s?m|km/.test(l.text), 'and how far it is', l.text);
  ok(namesAKey(l.sub) && /\bE\b/.test(l.sub), 'the how line names E', l.sub);

  // The one it picks really is the closest undone one.
  const near = nearestJob(G);
  let closest = null, cd = Infinity;
  for (const def of MISSIONS) {
    const p = PLACES[def.giver];
    const d = Math.hypot(p.x - G.veh.x, p.z - G.veh.z);
    if (d < cd) { cd = d; closest = def; }
  }
  ok(near.def.id === closest.id, `nearest job is ${closest.id}`, near.def.id);
  ok(Math.abs(near.dist - cd) < 1e-6, 'and the distance is the real one');

  // Do that one, and it moves on to the next.
  const G2 = fakeG(home.x + 40, home.z + 10, [closest.id]);
  const next = nearestJob(G2);
  ok(next && next.def.id !== closest.id, 'a job you have done stops being the target', next && next.def.id);
  ok(freeRoamLines(G2).text.includes(next.def.title), 'and the line follows it', freeRoamLines(G2).text);

  // Standing beside Deschênes, it points at Dave's, not at home.
  const dave = PLACES.dave;
  const G3 = fakeG(dave.x + 15, dave.z);
  ok(nearestJob(G3).place === dave, 'out in Deschênes it points at the Deschênes job');
}

group('GOAL A — every job done, and the line says so');
{
  const G = fakeG(PLACES.home.x, PLACES.home.z, MISSIONS.map((m) => m.id));
  const l = freeRoamLines(G);
  ok(l.kind === 'done', 'nothing left to do');
  ok(l.text === 'T’as tout fait. Roule.', 'and it says so', l.text);
  ok(namesAKey(l.sub), 'the how line still names a key', l.sub);
}

group('GOAL A — a friend’s car under your feet');
{
  const G = fakeG(PLACES.steph.x, PLACES.steph.z, [],
    { civic: { x: PLACES.steph.x + 2, z: PLACES.steph.z, yaw: 0 } });
  const car = carUnderfoot(G);
  ok(car && car.id === 'civic', 'the Civic is right there');
  const l = freeRoamLines(G);
  ok(l.kind === 'car', 'the line switches to the car');
  ok(/^E — prendre la Civic de Sayyad/.test(l.text), 'named, with the key', l.text);
  ok(/dort/.test(l.sub), 'and Sayyad is asleep', l.sub);
  // Rolling past it does not count.
  G.veh.vLong = 8;
  ok(carUnderfoot(G) === null, 'you have to have stopped');
  // Neither does one on the other side of the street.
  const far = fakeG(0, 0, [], { civic: { x: 40, z: 0, yaw: 0 } });
  ok(carUnderfoot(far) === null, 'and it has to be within reach');
}

group('distances read the way a person says them');
{
  ok(fmtDist(640) === '640 m', '640 m');
  ok(fmtDist(1420) === '1.4 km', '1.4 km');
}

// ---------------------------------------------------------------- 3. stuck

group('stuck: 20 m in 20 s, or the hint comes back');
{
  const toasts = [];
  let pulses = 0;
  const hud = { toast: (t) => toasts.push(t), pulseObjective: () => { pulses++; } };
  const G = {
    veh: { x: 0, z: 0 },
    mission: { idx: 0, stages: [{ text: 'va-t’en', sub: 'W', hint: 'suis le GPS' }] },
  };
  ok(STUCK_M === 20 && STUCK_T === 20, 'the numbers are the ones the brief asked for');

  let out = null;
  for (let i = 0; i < 19 * 60; i++) out = updateStuck(G, 1 / 60, hud) || out;
  ok(out === null && toasts.length === 0, 'nineteen seconds of sitting still: nothing yet');
  for (let i = 0; i < 1.5 * 60; i++) out = updateStuck(G, 1 / 60, hud) || out;
  ok(out === 'suis le GPS', 'past twenty, the hint comes back', String(out));
  ok(toasts.length === 1 && toasts[0] === 'Psst: suis le GPS', 'as a toast', toasts[0]);
  ok(pulses === 1, 'and the objective line pulses');

  // Actually going somewhere resets it.
  toasts.length = 0;
  const G2 = {
    veh: { x: 0, z: 0 },
    mission: { idx: 0, stages: [{ text: 'roule', sub: 'W', hint: 'tout droit' }] },
  };
  for (let i = 0; i < 30 * 60; i++) { G2.veh.x += 3 / 60; updateStuck(G2, 1 / 60, hud); }
  ok(toasts.length === 0, 'thirty seconds at 3 m/s never nags');

  // A stage with no hint falls back to its `sub`, which is the key line.
  const G3 = {
    veh: { x: 0, z: 0 },
    mission: { idx: 0, stages: [{ text: 'x', sub: 'E sur le pilier jaune' }] },
  };
  let r3 = null;
  for (let i = 0; i < 21 * 60; i++) r3 = updateStuck(G3, 1 / 60, null) || r3;
  ok(r3 === 'E sur le pilier jaune', 'no hint: it repeats the how line', String(r3));

  // Off a job it does nothing at all.
  const G4 = { veh: { x: 0, z: 0 }, mission: null, stuck: { anything: true } };
  ok(updateStuck(G4, 60, hud) === null && G4.stuck === null, 'free roam is never « stuck »');
}

// ---------------------------------------------------------------- 4. the opener

group('the new-game opener');
{
  ok(STORY_CARDS.length >= 3 && STORY_CARDS.length <= 4, `${STORY_CARDS.length} cards`);
  for (const c of STORY_CARDS) {
    ok(!!c.title && c.title === c.title.toUpperCase(), `card « ${c.title} »`);
    ok(typeof c.body === 'string' && c.body.length > 60, `card « ${c.title} » says something`);
  }
  const all = STORY_CARDS.map((c) => c.body).join(' ');
  ok(/Ranger XLT 1993/.test(all), 'it says what you are driving');
  ok(/dix-sept/.test(all) && /2004|Aylmer/.test(all), 'and who and when you are');
  for (const who of ['Margaret', 'Sayyad', 'Dave', 'Mike']) {
    ok(all.includes(who), `it introduces ${who}`);
  }
  ok(/Saturn/.test(all) && /Civic/.test(all) && /Sunfire/.test(all) && /divan/.test(all),
    'with their cars (and Mike’s couch)');
  ok(/pilier jaune/.test(all) && /\bE\b/.test(all), 'it explains the yellow pillars and E');
  ok(/première job/i.test(all), 'and it ends on the first goal');

  // Walking it, with no DOM at all.
  const op = new StoryOpener();
  let done = 0;
  op.show(() => { done++; });
  ok(op.active && op.i === 0, 'it opens on card 1');
  for (let i = 1; i < STORY_CARDS.length; i++) {
    ok(op.advance() === true, `E goes to card ${i + 1}`);
    ok(op.i === i, `...and it is card ${i + 1}`);
  }
  ok(op.advance() === false, 'E on the last card closes it');
  ok(!op.active && done === 1, 'the callback fires exactly once');
  ok(op.advance() === false && done === 1, 'and it cannot fire twice');

  // Escape skips out of the middle.
  const op2 = new StoryOpener();
  let done2 = 0;
  op2.show(() => { done2++; });
  op2.advance();
  ok(op2.finish() === true && done2 === 1 && !op2.active, 'Escape skips the rest, callback still fires');
}

group('the settings remember it');
{
  ok(DEFAULT_SETTINGS.storySeen === false, 'a fresh install has not seen the intro');
  ok(DEFAULT_SETTINGS.heckles === true, 'and the town is loud by default');
  const s = normalizeSettings({ storySeen: 1, heckles: 0 });
  ok(s.storySeen === true && s.heckles === false, 'both normalize to booleans');
  ok(normalizeSettings({}).storySeen === false, 'a missing key falls back');
  const gameplay = SECTIONS.find((x) => x.id === 'gameplay');
  ok(gameplay.rows.some((r) => r.k === 'heckles'), 'Options > Jeu has the « les gens gueulent » switch');
  ok(gameplay.rows.some((r) => r.act === 'story'), 'Options > Jeu can replay the intro');
}

// ---------------------------------------------------------------- 5. friends

group('the friends have something to say');
{
  for (const m of MISSIONS) {
    const s = friendLines(m.id, 'start'), e = friendLines(m.id, 'end');
    ok(s.length >= 1 && e.length >= 1, `${m.id}: lines at both ends (${s.length} / ${e.length})`);
    for (const [who, text] of [...s, ...e]) {
      ok(!!who && !!text && text.length > 4, `${m.id}: « ${who}: ${text.slice(0, 30)}... »`);
    }
  }
  const total = Object.values(FRIEND_LINES)
    .reduce((n, e) => n + (e.start || []).length + (e.end || []).length, 0);
  ok(total >= 28, `${total} lines of dialogue in all`);
  ok(friendLines('nope').length === 0, 'a job with nobody attached says nothing');
  ok(friendLines('sayyad', 'end').some(([, t]) => /scratches la Civic/.test(t)),
    'Sayyad says the thing about the Civic');
}

// ---------------------------------------------------------------- 6. heckles

group('GOAL B — the pool');
{
  const lines = allLines();
  const uniq = new Set(lines);
  ok(uniq.size >= 40, `${uniq.size} unique lines`);
  ok(uniq.size === lines.length, 'no line appears in two pools', `${lines.length} vs ${uniq.size}`);
  for (const key of ['dive', 'honk', 'shove', 'parked', 'red', 'rival', 'cop', 'clean']) {
    ok(Array.isArray(HECKLES[key]) && HECKLES[key].length >= 5, `${key}: ${HECKLES[key].length} lines`);
    ok(!!SPEAKER[key], `${key} has a default speaker (${SPEAKER[key]})`);
  }
  ok(HECKLES.dive.includes('Heille, le cave!'), 'the classic is in there');
  ok(HECKLES.parked.includes('MON CHAR!'), 'and MON CHAR!');
  ok(HECKLES.cop.includes('Rangez-vous sur le côté!'), 'and the megaphone');
  ok(HECKLES.clean.includes('Beau, propre.'), 'and the compliment');
  ok(lines.every((l) => l.length <= 60), 'every line fits in a speech bubble');
}

group('GOAL B — the limiter');
{
  const h = new Heckle();
  h.bind({ settings: { ...DEFAULT_SETTINGS } });
  const first = h.say('Piéton', 'dive');
  ok(!!first, `one goes out: « ${first} »`);
  ok(h.say('Piéton', 'dive') === null, 'the next one, same tick, does not');
  h.update(GAP - 0.5);
  ok(h.say('Piéton', 'dive') === null, `still nothing at ${GAP - 0.5} s`);
  h.update(1);
  const second = h.say('Piéton', 'dive');
  ok(!!second, `one gets through past ${GAP} s`);
  ok(second !== first, 'and it is not the same line');

  // Nothing repeats inside the cooldown, whatever the trigger.
  const h2 = new Heckle();
  h2.bind({ settings: { ...DEFAULT_SETTINGS } });
  const seen = [];
  for (let i = 0; i < 40; i++) {
    const l = h2.say('Piéton', 'dive');
    if (l) seen.push({ l, t: h2.t });
    h2.update(GAP + 0.01);
  }
  ok(seen.length >= 6, `${seen.length} lines over ${Math.round(h2.t)} s`);
  let repeat = null;
  for (let i = 0; i < seen.length; i++) {
    for (let j = i + 1; j < seen.length; j++) {
      if (seen[i].l === seen[j].l && seen[j].t - seen[i].t < COOLDOWN) repeat = seen[i].l;
    }
  }
  ok(repeat === null, `nothing repeats inside ${COOLDOWN} s`, repeat || '');
  // ...and a small pool eventually runs dry rather than repeating.
  const h3 = new Heckle();
  h3.bind({ settings: { ...DEFAULT_SETTINGS } });
  let got = 0;
  for (let i = 0; i < HECKLES.red.length + 3; i++) {
    if (h3.say('Chauffeur', 'red')) got++;
    h3.update(GAP + 0.01);
  }
  ok(got === HECKLES.red.length, `the ${HECKLES.red.length} red-light lines go once each, then silence`, String(got));

  // The switch in Options > Jeu.
  const h4 = new Heckle();
  h4.bind({ settings: { ...DEFAULT_SETTINGS, heckles: false } });
  ok(h4.say('Piéton', 'dive') === null, 'off means off');
  h4.bind({ settings: { ...DEFAULT_SETTINGS, heckles: true } });
  ok(!!h4.say('Piéton', 'dive'), 'and on means on');
  const h5 = new Heckle();          // no settings at all: default on
  ok(!!h5.say('Piéton', 'dive'), 'a G with no settings still yells');
  ok(h5.say('Piéton', 'nope') === null, 'an unknown trigger is a no-op');
}

group('GOAL B — drive clean for a minute and somebody notices');
{
  const h = new Heckle();
  const G = { settings: { ...DEFAULT_SETTINGS }, veh: { speedKmh: 60 } };
  h.bind(G);
  for (let i = 0; i < (CLEAN_AFTER - 1) * 60; i++) h.update(1 / 60, G);
  ok(h.count === 0, `nothing yet at ${CLEAN_AFTER - 1} s`);
  for (let i = 0; i < 2 * 60; i++) h.update(1 / 60, G);
  ok(h.count === 1 && HECKLES.clean.includes(h.last), `« ${h.last} » after ${CLEAN_AFTER} s`);

  // Being yelled at resets the clock.
  const h2 = new Heckle();
  const G2 = { settings: { ...DEFAULT_SETTINGS }, veh: { speedKmh: 60 } };
  h2.bind(G2);
  for (let i = 0; i < 50 * 60; i++) h2.update(1 / 60, G2);
  h2.say('Piéton', 'dive');
  for (let i = 0; i < 20 * 60; i++) h2.update(1 / 60, G2);
  ok(h2.count === 1, 'a heckle at 50 s means no compliment at 70 s');

  // And parking for a minute is not "driving clean".
  const h3 = new Heckle();
  const G3 = { settings: { ...DEFAULT_SETTINGS }, veh: { speedKmh: 0 } };
  h3.bind(G3);
  for (let i = 0; i < 120 * 60; i++) h3.update(1 / 60, G3);
  ok(h3.count === 0, `sitting still for two minutes earns nothing (needs ${CLEAN_MOVING} s moving)`);
}

group('GOAL B — dialogue is not a heckle');
{
  const h = new Heckle();
  h.bind({ settings: { ...DEFAULT_SETTINGS, heckles: false } });
  ok(h.line('Sayyad', '« Si tu scratches la Civic, tu la répares. »') !== null,
    'the friends talk even with the heckles off');
  ok(h.say('Piéton', 'dive') === null, '...and the heckles are still off');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
