// The summer's five beats:  node tools/smoke_arc.mjs
//
// The other suites audit MISSIONS, and four of the five beats are not in
// MISSIONS until you have earned them — so everything the rest of the repo
// checks for a job, this file checks for a locked beat: a goal line, a how line
// that names a key, a hint, a real place, a route the GPS can actually draw,
// and a payout inside the same $15-75 band as every other job.
//
// It also checks the two things that are specific to an arc:
//
//   * the beats arrive in order, gated on work done and not on a calendar
//   * the epilogue has no clock, no rivals and no police
import { readFileSync, existsSync } from 'node:fs';
import { MAP } from '../src/game/mapdata.js';
import { PLACES, resolvePlaces } from '../src/game/places.js';
import { Nav, routeLength } from '../src/game/nav.js';
import { CARS } from '../src/game/cars.js';
import { resolveAt } from '../src/game/missionkit.js';

let pass = 0, fail = 0;
const fails = [];
const ok = (c, name, extra) => {
  if (c) { pass++; console.log('  ok   ' + name); }
  else { fail++; fails.push(name); console.log('  FAIL ' + name + (extra ? '  — ' + extra : '')); }
};
const group = (n) => console.log('\n' + n);

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), clear: () => mem.clear(),
};

const {
  MISSIONS, ALL_MISSIONS, ARC, GATES, gateOpen, openBeats, unlockArc, resetArcSync,
  missionPayout, TIME_OF_DAY,
} = await import('../src/game/missions.js');
const {
  SPAN, SHOULDER, CHAUDIERE, ALEXANDRA, NEPEAN, LUCERNE_A, LUCERNE_B, HOSE,
  ARC_LINES, applyArcText, loadArcText, registerArcLines,
} = await import('../src/game/arc.js');

const nearestRoad = (x, z) => {
  let bd = Infinity, best = { x, z, yaw: 0, name: '', dist: Infinity };
  for (const r of MAP.roads) {
    if (r.cls === 'service') continue;
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
      const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1e-6;
      const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
      const px = ax + ex * t, pz = az + ez * t;
      const d = Math.hypot(px - x, pz - z);
      if (d < bd) { bd = d; best = { x: px, z: pz, yaw: Math.atan2(ex, ez), name: r.name || '', dist: d }; }
    }
  }
  return best;
};
resolvePlaces({ nearestRoad });
const nav = new Nav();

// ---------------------------------------------------------------- 1. shape

group('five beats, in order');
{
  ok(ARC.length === 5, `${ARC.length} beats`);
  ok(ARC.map((d) => d.beat).join(',') === 'prologue,turn1,turn2,turn3,epilogue',
    'prologue, three turns, epilogue', ARC.map((d) => d.beat).join(','));
  ok(ALL_MISSIONS.length === MISSIONS.length + 5,
    `${MISSIONS.length} jobs open on a new save, ${ALL_MISSIONS.length} in the whole summer`);
  for (const d of ARC) {
    ok(!!PLACES[d.giver], `${d.id}: its giver is a real place (${d.giver})`);
    ok(!!TIME_OF_DAY[d.timeOfDay], `${d.id}: ${d.timeOfDay}`);
    ok(typeof d.title === 'string' && d.title.length > 4, `${d.id}: « ${d.title} »`);
    ok(typeof d.brief === 'string' && d.brief.length > 20, `${d.id}: has a brief`);
    // The hangout's porch is the hangout's; a beat that made 129 Frank-Robinson
    // a job-giver would take the E key off it.
    ok(d.giver !== 'mike', `${d.id}: does not turn Mike's driveway into a pillar`);
  }
}

group('the gates are progress, not a calendar');
{
  const done = (...ids) => new Set(ids);
  ok(!gateOpen('arckeys', done()), 'nothing is open before you have driven anything');
  ok(gateOpen('arckeys', done('school')), 'one job in, your father makes it a deal');
  ok(!gateOpen('arcbache', done('school', 'dep')), 'the Saint-Jean waits for three jobs');
  ok(!gateOpen('arcbache', done('a', 'b', 'c')), '...three jobs AND the keys');
  ok(gateOpen('arcbache', done('arckeys', 'b', 'c')), 'three jobs including the keys opens it');
  ok(!gateOpen('arcsurchauffe', new Set(['arckeys', 'b', 'c', 'd', 'e', 'f'])),
    'the bridge waits for the Saint-Jean');
  const six = new Set(['arckeys', 'arcbache', 'c', 'd', 'e', 'f']);
  ok(gateOpen('arcsurchauffe', six), '...and six jobs opens it');
  const fourteen = new Set(['arckeys', 'arcbache', 'arcsurchauffe', 'arcveillee',
    ...Array.from({ length: 10 }, (_, i) => 'j' + i)]);
  ok(gateOpen('arcdernier', fourteen), 'the last morning is fourteen jobs deep');
  ok(!gateOpen('arcdernier', new Set([...fourteen].filter((k) => k !== 'arcveillee'))),
    '...and never before the last night');
  // Monotone: a gate never closes as you do more.
  let opened = 0;
  const acc = new Set();
  for (const id of ['school', 'arckeys', 'dep', 'arcbache', 'cv', 'poutine', 'gang', 'arcsurchauffe']) {
    acc.add(id);
    const n = openBeats(acc).length;
    ok(n >= opened, `after ${acc.size} jobs, ${n} beats are open`);
    opened = n;
  }
}

group('unlockArc puts them on the map as they are earned');
{
  const hud = { toasts: [], toast(t) { this.toasts.push(t); } };
  const G = { done: new Set(), hud, audio: { chime() {} } };
  resetArcSync();
  const base = MISSIONS.length;
  ok(unlockArc(G).length === 0, 'a brand-new save gets nothing');
  ok(MISSIONS.length === base, 'and MISSIONS does not grow');
  G.done.add('school');
  const a = unlockArc(G);
  ok(a.length === 1 && a[0].id === 'arckeys', 'the first job opens the prologue');
  ok(MISSIONS.includes(a[0]), 'which is now a marker on the map');
  ok(hud.toasts.some((t) => /NOUVELLE JOB/.test(t)), 'and you are told about it', hud.toasts[0]);
  ok(unlockArc(G).length === 0, 'calling it again is a no-op');
  // The whole summer.
  for (const id of ['arckeys', 'a', 'b', 'arcbache', 'c', 'd', 'arcsurchauffe', 'e', 'f', 'g',
    'arcveillee', 'h', 'i', 'j', 'k', 'l']) { G.done.add(id); unlockArc(G); }
  ok(ARC.every((d) => MISSIONS.includes(d)), `all five beats are open after ${G.done.size} jobs`);
  ok(MISSIONS.length === base + 5, `${MISSIONS.length} jobs in the pause menu at the end of the summer`);

  // A new game hands main.js a brand-new Set. The beats have to go away again.
  const fresh = { done: new Set(), hud: { toast() {} }, audio: { chime() {} } };
  unlockArc(fresh);
  ok(!ARC.some((d) => MISSIONS.includes(d)), 'starting a new summer takes them all back off');
  ok(MISSIONS.length === base, `back to ${MISSIONS.length}`);
  // ...and finishing a job in the SAME save never removes anything.
  const keep = { done: new Set(['school']), hud: { toast() {} }, audio: { chime() {} } };
  unlockArc(keep);
  keep.done.add('dep');
  unlockArc(keep);
  ok(MISSIONS.some((d) => d.id === 'arckeys'), 'a beat you earned stays earned');
  // Leave MISSIONS the way we found it.
  unlockArc({ done: new Set(), hud: { toast() {} }, audio: { chime() {} } });
  resetArcSync();
  ok(MISSIONS.length === base, 'and the suite leaves MISSIONS alone');
}

// ---------------------------------------------------------------- 2. stages

// The same rule story.js holds every other job to: `sub` names the key.
const KEY_RE = /\bEspace\b|\bGPS\b|pilier|(?:^|[\s(«])[EWSAD](?:\/[EWSAD])?(?=[\s,.!:·)»]|$)/u;

group('every stage says what to do and which key does it');
{
  let n = 0;
  for (const car of CARS) {
    const ctx = { carId: car.id, carName: car.name, seats: car.seats, money: 300 };
    for (const d of ARC) {
      for (const st of d.build(ctx)) {
        n++;
        const where = `${d.id}/${car.id} “${String(st.text || '').slice(0, 30)}”`;
        ok(typeof st.text === 'string' && st.text.trim().length > 0, `${where}: goal line`);
        ok(typeof st.sub === 'string' && st.sub.trim().length > 0, `${where}: how line`);
        ok(KEY_RE.test(st.sub), `${where}: the how line names a key`, st.sub);
        ok(typeof st.hint === 'string' && st.hint.trim().length > 8, `${where}: hint`, st.hint);
        if (typeof st.at === 'string') ok(!!PLACES[st.at], `${where}: ${st.at} is a real place`);
      }
    }
  }
  ok(n > 100, `${n} stage builds audited across ${CARS.length} cars`);
}

group('every beat pays, in the same band as every other job');
{
  let total = 0;
  for (const d of ARC) {
    const bench = missionPayout(d, { seats: 2, carId: 'ranger', money: 300 });
    const wide = missionPayout(d, { seats: 6, carId: 'caravan', money: 300 });
    ok(bench > 0 && wide > 0, `${d.id} pays $${bench} net`);
    ok(bench >= 15 && bench <= 75, `${d.id} is in the $15-75 band`, String(bench));
    total += bench;
  }
  ok(total >= 100, `the whole summer is $${total} on top of the jobs`);
}

group('the GPS can draw every leg');
{
  for (const d of ARC) {
    const stages = d.build({ carId: 'ranger', carName: 'Ranger', seats: 2, money: 300 });
    let x = PLACES[d.giver].x, z = PLACES[d.giver].z;
    let metres = 0;
    for (const st of stages) {
      const p = resolveAt(st.at, {});
      if (!p) continue;
      // The flatbed does the Champlain-to-Norm's leg, so it is not a drive.
      const towed = st.kind === 'lecture';
      const route = nav.route(x, z, p.x, p.z);
      ok(!!route, `${d.id}: « ${String(st.text).slice(0, 34)} » routes`, `${x.toFixed(0)},${z.toFixed(0)} -> ${p.x.toFixed(0)},${p.z.toFixed(0)}`);
      if (route && !towed) metres += routeLength(route, x, z);
      x = p.x; z = p.z;
      // Only the arc's own literal coordinates: a PLACES key with `lot: true`
      // is deliberately snapped into a parking aisle, which nearestRoad (which
      // skips service roads, like world.js) reports as a hundred metres out.
      if (typeof st.at !== 'string') {
        const nr = nearestRoad(p.x, p.z);
        ok(nr.dist < 40, `${d.id}: that target is ${nr.dist.toFixed(0)} m off the road graph (${nr.name})`);
      }
      // A timer that asks for more than 90 km/h door-to-door is a broken timer.
      if (st.time && route) {
        const kmh = (routeLength(route, x, z) / st.time) * 3.6;
        ok(kmh < 90, `${d.id}: « ${String(st.text).slice(0, 24)} » asks for ${kmh.toFixed(0)} km/h`);
      }
    }
    ok(metres > 500 && metres < 22000, `${d.id} is ${(metres / 1000).toFixed(1)} km of driving`);
  }
}

group('the named geography is where it says it is');
{
  for (const [name, p, road] of [
    ['the Champlain span', SPAN, /Champlain/],
    ['the shoulder past it', SHOULDER, /Champlain/],
    ['the Chaudière', CHAUDIERE, /./],
    ['the Alexandra', ALEXANDRA, /Alexandra/],
    ['Nepean Point', NEPEAN, /Alexandra/],
    ['Lucerne, start', LUCERNE_A, /Lucerne/],
    ['Lucerne, finish', LUCERNE_B, /Lucerne/],
  ]) {
    const nr = nearestRoad(p.x, p.z);
    ok(nr.dist < 40, `${name} is on the road graph (${nr.dist.toFixed(1)} m from ${nr.name})`);
    ok(road.test(nr.name), `${name} is on ${nr.name}`);
  }
  const trial = nav.route(LUCERNE_A.x, LUCERNE_A.z, LUCERNE_B.x, LUCERNE_B.z);
  const m = trial ? routeLength(trial, LUCERNE_A.x, LUCERNE_A.z) : 0;
  ok(m > 1200 && m < 1900, `Sayyad's time trial is ${Math.round(m)} m — « un kilomètre et demi »`);
}

// ---------------------------------------------------------------- 3. the beats

group('beat 3 breaks the truck and makes you pay for it');
{
  const d = ARC.find((x) => x.id === 'arcsurchauffe');
  const st = d.build({ carId: 'ranger', carName: 'Ranger', seats: 2, money: 300 });
  const blow = st.find((s) => s.kind === 'blow');
  ok(!!blow && !!blow.onExit, 'the hose lets go mid-span');
  // What damage.js's restoreDamage touches on a real Vehicle, and nothing else.
  const veh = { damage: 0, deformF: 0, headOut: 0, pull: 0, spec: { id: 'ranger' },
    repair() { this.damage = 0; this.deformF = 0; this.headOut = 0; this.pull = 0; } };
  const G = { veh, health: {}, repairHints: { h25: true, h60: true }, hud: { toast() {} } };
  blow.onExit(G);
  ok(veh.damage >= 25, `the Ranger comes off the bridge at ${veh.damage} damage`);
  ok(veh.damage < 60, '...but not so hurt that the next twenty minutes are a punishment');
  ok(G.health.ranger === veh.damage, 'and the session remembers it');
  ok(G.repairHints.h25 === false, 'the "go get it fixed" nagging is re-armed');

  const tow = st.find((s) => s.at === SHOULDER);
  ok(!!tow && !!tow.onExit, 'Norm turns up with the flatbed');
  const moved = { x: 0, z: 0, reset(x, z) { this.x = x; this.z = z; } };
  tow.onExit({ veh: moved, hud: { toast() {} } });
  ok(Math.hypot(moved.x - PLACES.ctire.x, moved.z - PLACES.ctire.z) < 1,
    'and the truck ends up at his garage on chemin d’Aylmer');

  const pay = st.find((s) => s.kind === 'pay');
  ok(pay && pay.cost === HOSE.parts, `the parts are $${HOSE.parts}`);
  ok(pay && /Reviens quand/.test(pay.brokeText || ''), 'and being broke is a wall, not a soft no');
  const earned = st.filter((s) => s.money).reduce((a, s) => a + s.money, 0);
  ok(earned > HOSE.parts, `the three jobs pay $${earned}, which covers the $${HOSE.parts}`);
  ok(st.filter((s) => s.money).length === 3, 'three quick jobs, as written');
  const fixed = { repaired: false, spec: { id: 'ranger' }, repair() { this.repaired = true; } };
  pay.onExit({ veh: fixed, health: {}, repairHints: {}, hud: { setRepairHint() {}, setRepairPrompt() {} } });
  ok(fixed.repaired, 'paying Norm actually fixes it');
}

group('the last morning has no clock on it');
{
  const d = ARC.find((x) => x.id === 'arcdernier');
  const st = d.build({ carId: 'ranger', carName: 'Ranger', seats: 2, money: 300 });
  ok(st.every((s) => s.time == null), 'no stage of the epilogue is timed');
  ok(st.every((s) => !s.failWhy), 'and there is nothing to fail');
  ok(st.some((s) => s.at === 'mike'), 'it goes to 129 Frank-Robinson one last time');
  ok(/divan|arbre/.test(st.find((s) => s.at === 'mike').toast || ''),
    'and the couch is still up there', st.find((s) => s.at === 'mike').toast);
  ok(st[st.length - 1].at === 'home', 'and ends in your own driveway');
  // The police are told to go away, every tick, on every stage.
  let cleared = 0;
  const G = { cops: { clear() { cleared++; } } };
  for (const s of st) { ok(typeof s.onTick === 'function', `${String(s.text).slice(0, 22)}: has the no-cops tick`); s.onTick(G); }
  ok(cleared === st.length, `the heat is cleared on all ${st.length} stages`);
}

// ---------------------------------------------------------------- 4. the text

group('the beats are named by assets/text/arc.json');
{
  ok(existsSync('assets/text/arc.json'), 'the file is there');
  const j = JSON.parse(readFileSync('assets/text/arc.json', 'utf8'));
  ok(Array.isArray(j.arc) && j.arc.length === 5, `${j.arc.length} beats in the file`);
  const beats = j.arc.map((b) => b.beat).join(',');
  ok(beats === ARC.map((d) => d.beat).join(','), 'and they line up with the code', beats);

  const before = ARC.map((d) => d.title);
  const n = applyArcText(j.arc);
  ok(n === 5, 'all five titles come out of the JSON');
  ok(ARC.every((d, i) => d.title === j.arc[i].title), 'and they are the file\'s titles now',
    ARC.map((d) => d.title).join(' / '));
  ok(ARC.every((d) => d.note), 'the emotional note rides along for whoever wants it');
  ok(before.join() === ARC.map((d) => d.title).join(),
    'which happen to be the ones written in arc.js as the fallback');

  ok(applyArcText(null) === 0, 'a missing file changes nothing');
  ok(applyArcText([{ beat: 'nope', title: 'x' }]) === 0, 'and an unknown beat is skipped');
  ok(await loadArcText(async () => ({ ok: false })) === null, 'a 404 is null, not a throw');
  ok(await loadArcText(async () => { throw new Error('x'); }) === null, 'so is an offline fetch');
}

group('the friends have something to say at both ends');
{
  await registerArcLines();
  const { friendLines } = await import('../src/game/story.js');
  for (const d of ARC) {
    const s = friendLines(d.id, 'start'), e = friendLines(d.id, 'end');
    ok(s.length >= 1 && e.length >= 1, `${d.id}: ${s.length} at the start, ${e.length} at the end`);
  }
  const who = new Set(Object.values(ARC_LINES).flatMap((v) => [...v.start, ...v.end]).map(([w]) => w));
  ok(who.has('Ton père') && who.has('Mike') && who.has('Zahra') && who.has('Norm Lafleur'),
    'the right people talk: ' + [...who].join(', '));
  // Canon: nobody in this game has an invented surname.
  const text = JSON.stringify(ARC_LINES) + JSON.stringify(ARC.map((d) => [d.title, d.brief]));
  for (const bad of [/Sayyad\s+[A-ZÉÈ]/, /Zahra\s+[A-ZÉÈ]/, /Margaret\s+[A-ZÉÈ]/, /\bsteph\b/i, /\bmarc\b/i, /\bdave\b/i]) {
    ok(!bad.test(text), `no ${bad} anywhere a player can see it`);
  }
  ok(/Mike/.test(text), 'Mike is Mike');
}

console.log('\n' + (fail ? `FAILED  ${fail} of ${pass + fail}` : `ok  ${pass} assertions`));
if (fail) { for (const f of fails) console.log('  - ' + f); process.exit(1); }
