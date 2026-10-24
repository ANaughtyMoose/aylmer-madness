// The summer's four beats:  node tools/smoke_arc.mjs
// (Five until Tom's D31, 13 Oct 2026, cut « La surchauffe du pont ».)
//
// The other suites audit MISSIONS, and some of the beats are not in
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
  SPAN, CHAUDIERE, ALEXANDRA, NEPEAN, LUCERNE_A, LUCERNE_B,
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

group('four beats, in order');
{
  // D31 (Tom, 13 Oct 2026): « turn2 », the radiator hose on the bridge, is cut
  // with no code left; its id is in campaign.js RETIRED for old saves.
  ok(ARC.length === 4, `${ARC.length} beats`);
  ok(ARC.map((d) => d.beat).join(',') === 'prologue,turn1,turn3,epilogue',
    'prologue, two turns, epilogue', ARC.map((d) => d.beat).join(','));
  ok(!ARC.some((d) => d.id === 'arcsurchauffe'), 'the bridge beat has no definition left');
  // Restructure (29 Sept 2026): the beats are no longer pushed onto MISSIONS
  // as they are earned. Two are live (La Saint-Jean, Le dernier soir; La
  // surchauffe is cut, D31), two are retired (kept in ARC for old saves only), and every
  // live job is in MISSIONS from the start; the lock is campaign.js's.
  const live = ARC.filter((d) => ALL_MISSIONS.includes(d)).map((d) => d.id);
  ok(live.join(',') === 'arcbache,arcdernier', 'two live beats: ' + live.join(','));
  for (const id of ['arckeys', 'arcveillee', 'arcsurchauffe']) {
    ok(!ALL_MISSIONS.some((d) => d.id === id), `${id} is retired: not in ALL_MISSIONS`);
    ok(!MISSIONS.some((d) => d.id === id), `${id} is not in MISSIONS either`);
  }
  ok(MISSIONS.length === ALL_MISSIONS.length && ALL_MISSIONS.every((d) => MISSIONS.includes(d)),
    `${MISSIONS.length} jobs in MISSIONS on a new save, the same ${ALL_MISSIONS.length} as the whole summer`);
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

group('the gates are the story, not a job count');
// Restructure (29 Sept 2026): the job-count gates (1/5/12/22/32) are gone; the
// old assertions encoded them. A beat now opens when campaign.js's main
// mission before it is done (arcbache after sayyad), and the finale when every main mission is.
{
  const { mainIds } = await import('../src/game/campaign.js');
  const mains = mainIds();
  ok(Object.keys(GATES).sort().join(',') === 'arcbache,arcdernier', 'two gates: ' + Object.keys(GATES).join(','));
  ok(GATES.arcbache.after === 'sayyad' && GATES.arcbache.fromDay === 2, 'the Saint-Jean follows Sayyad, from day 2 (24 June)');
  ok(GATES.arcdernier.after === 'all', 'the finale follows everything');
  ok(!gateOpen('arcbache', new Set()), 'nothing is open before you have driven anything');
  ok(!gateOpen('arcbache', new Set(['alternateur'])), 'the alternator alone does not open the beach');
  ok(gateOpen('arcbache', new Set(['alternateur', 'sayyad'])), 'Sayyad awake opens the Saint-Jean');
  // Twenty optional or unknown jobs do not stand in for a main mission.
  const busy = new Set(['alternateur', 'dep', 'margaretdental', ...Array.from({ length: 20 }, (_, i) => 'j' + i)]);
  ok(!gateOpen('arcbache', busy), 'a pile of other jobs does not open it (no counts)');
  const allMains = new Set(mains);
  ok(gateOpen('arcdernier', allMains), `the finale opens after all ${mains.length} main missions`);
  for (const m of mains) {
    const less = new Set(mains.filter((x) => x !== m));
    ok(!gateOpen('arcdernier', less), `...not without ${m}`);
  }
  for (const id of ['arckeys', 'arcveillee', 'arcsurchauffe']) {
    ok(!gateOpen(id, allMains) && !gateOpen(id, new Set()), `${id} is retired: its gate never opens`);
  }
  // Monotone: a gate never closes as you do more.
  let opened = 0;
  const acc = new Set();
  for (const id of [...mains.slice(0, 3), 'dep', 'gang', ...mains.slice(3)]) {
    acc.add(id);
    const k = openBeats(acc).length;
    ok(k >= opened, `after ${acc.size} jobs, ${k} beats are open`);
    opened = k;
  }
  ok(opened === 2, 'and both live beats end up open');
}

group('unlockArc announces the next main mission, and never touches MISSIONS');
{
  const { mainIds, FINALE } = await import('../src/game/campaign.js');
  const mains = mainIds();
  const hud = { toasts: [], toast(t) { this.toasts.push(t); } };
  const G = { done: new Set(), hud, audio: { chime() {} } };
  resetArcSync();
  const base = MISSIONS.slice();
  ok(unlockArc(G).length === 0, 'a brand-new save gets nothing (silent first sync)');
  ok(MISSIONS.length === base.length, 'and MISSIONS does not grow');
  G.done.add('alternateur');
  const a = unlockArc(G);
  ok(a.length === 1 && a[0].id === 'sayyad', 'the alternator opens « Réveiller Sayyad »', a.map((d) => d.id).join());
  ok(MISSIONS.includes(a[0]), 'which was a marker all along');
  ok(hud.toasts.some((t) => /NOUVELLE JOB/.test(t)), 'and you are told about it', hud.toasts[0]);
  ok(unlockArc(G).length === 0, 'calling it again is a no-op');
  G.done.add('dep');
  ok(unlockArc(G).length === 0, 'an optional job announces no main mission');
  // The whole summer, one main at a time.
  let steps = 0;
  for (let i = 1; i < mains.length; i++) {
    G.done.add(mains[i]);
    const got = unlockArc(G).map((d) => d.id);
    const want = i + 1 < mains.length ? mains[i + 1] : FINALE;
    if (got.length === 1 && got[0] === want) steps++;
    else ok(false, `finishing ${mains[i]} announces ${want}`, got.join());
  }
  ok(steps === mains.length - 1, `each of the ${mains.length - 1} main missions after the first announces the next, the last one the finale`);
  ok(MISSIONS.length === base.length && base.every((d, i) => MISSIONS[i] === d), 'MISSIONS is the same list, in the same order');
  // A new game hands main.js a brand-new Set: silent, and nothing moves.
  ok(unlockArc({ done: new Set(), hud: { toast() {} }, audio: { chime() {} } }).length === 0, 'a new summer is announced nothing');
  ok(MISSIONS.length === base.length, `still ${MISSIONS.length}`);
  resetArcSync();
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
    // Le dernier soir is a free drive from home back home (no GPS): every
    // stage is at 299 Fraser, so the routed distance is zero by design.
    if (d.id === 'arcdernier') ok(metres === 0 && stages.every((st) => st.at === 'home'), 'arcdernier: every stage is at home, the drive is yours');
    else ok(metres > 500 && metres < 22000, `${d.id} is ${(metres / 1000).toFixed(1)} km of driving`);
  }
}

group('the named geography is where it says it is');
{
  for (const [name, p, road] of [
    ['the Champlain span', SPAN, /Champlain/],
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

group('the last night has no clock on it');
// Was « the last morning »: it went to 129 Frank-Robinson as a stage. Le
// dernier soir (restructure) is a free drive; the couch in the tree is now a
// callback you find if you drive by, and the three stages are all at home.
{
  const { FINALE_CALLBACKS, FINALE_CALL, finaleTick } = await import('../src/game/arc.js');
  const d = ARC.find((x) => x.id === 'arcdernier');
  const st = d.build({ carId: 'ranger', carName: 'Ranger', seats: 2, money: 300 });
  ok(st.length === 3 && st.map((s) => s.kind).join(',') === 'drive,phone,table', 'three stages: drive, phone, table');
  ok(st.every((s) => s.time == null), 'no stage of the epilogue is timed');
  ok(st.every((s) => !s.failWhy), 'and there is nothing to fail');
  ok(st[0].noRoute === true, 'the drive has no GPS line');
  const mike = FINALE_CALLBACKS.find((c) => c.at === 'mike');
  ok(!!mike, '129 Frank-Robinson is one of the places you can drive by');
  ok(/divan|arbre/.test(mike?.line || ''), 'and the couch is still up there', mike?.line);
  ok(FINALE_CALLBACKS.every((c) => !!PLACES[c.at]), 'every callback is a real place');
  ok(st[st.length - 1].at === 'home', 'and ends in your own driveway');
  ok(FINALE_CALL.length >= 2 && FINALE_CALL[0][0] === 'Margaret', 'Margaret answers the phone');
  // The police are told to go away, every tick, on every stage.
  let cleared = 0;
  const G = { cops: { clear() { cleared++; } } };
  const m = {};
  for (const s of st) { ok(typeof s.onTick === 'function', `${String(s.text).slice(0, 22)}: has the no-cops tick`); s.onTick(G, m); }
  ok(cleared === st.length, `the heat is cleared on all ${st.length} stages`);
  // The drive's tick is the callbacks: parked at Mike's, you hear about the couch once.
  const toasts = [];
  const G2 = { veh: { x: PLACES.mike.x, z: PLACES.mike.z }, hud: { toast: (t) => toasts.push(t) } };
  const m2 = {};
  st[0].onTick(G2, m2); st[0].onTick(G2, m2);
  ok(toasts.filter((t) => t === mike.line).length === 1, 'driving by Mike\'s plays its callback exactly once');
  void finaleTick;
}

// ---------------------------------------------------------------- 4. the text

group('the beats are named by assets/text/arc.json');
{
  ok(existsSync('assets/text/arc.json'), 'the file is there');
  const j = JSON.parse(readFileSync('assets/text/arc.json', 'utf8'));
  ok(Array.isArray(j.arc) && j.arc.length === 4, `${j.arc.length} beats in the file`);
  const beats = j.arc.map((b) => b.beat).join(',');
  ok(beats === ARC.map((d) => d.beat).join(','), 'and they line up with the code', beats);

  const before = ARC.map((d) => d.title);
  const n = applyArcText(j.arc);
  ok(n === 4, 'all four titles come out of the JSON');
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
  // Canon changed (docs/STORY-LEDGER.md, 21-28 Sept 2026): Tom's father did
  // not live at 299 Fraser and never lent the truck, so « Ton père » no longer
  // speaks in the arc; Tom's mother Margaret does, at home.
  ok(who.has('Margaret') && who.has('Mike') && who.has('Zahra'),
    'the right people talk: ' + [...who].join(', '));
  ok(!who.has('Norm Lafleur'), 'and nobody from the cut bridge beat (D31): ' + [...who].join(', '));
  ok(!who.has('Ton père'), 'and his father is not at the house: ' + [...who].join(', '));
  // Canon: nobody in this game has an invented surname.
  const text = JSON.stringify(ARC_LINES) + JSON.stringify(ARC.map((d) => [d.title, d.brief]));
  for (const bad of [/Sayyad\s+[A-ZÉÈ]/, /Zahra\s+[A-ZÉÈ]/, /Margaret\s+[A-ZÉÈ]/, /\bsteph\b/i, /\bmarc\b/i, /\bdave\b/i]) {
    ok(!bad.test(text), `no ${bad} anywhere a player can see it`);
  }
  ok(/Mike/.test(text), 'Mike is Mike');
}

console.log('\n' + (fail ? `FAILED  ${fail} of ${pass + fail}` : `ok  ${pass} assertions`));
if (fail) { for (const f of fails) console.log('  - ' + f); process.exit(1); }
