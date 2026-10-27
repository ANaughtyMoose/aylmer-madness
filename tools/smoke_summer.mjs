// S4-SUMMER (20 Oct 2026): the summer has a middle. The ten main missions are
// spread from 22 June to Labour Day by campaign.js DATE_GATES, the days between
// are filled by the optional jobs, and sleeping at 299 Fraser (Z, summer.js)
// passes the days when there is nothing new. Walked with the game's own code:
// missions.js nextMission / missionAvailable, calendar.js spendDay,
// summer.js sleepTarget / planSleep / applySleep, story.js freeRoamLines.
//
// Bars:
//   1. A player who does each new thing once (story first) never sleeps more
//      than DEAD_STRETCH_MAX (6) nights in a row with nothing new.
//   2. The story is never ahead of its dates, the Saint-Jean is played on
//      24 June, and the finale starts on Labour Day (no jump of more than a day).
//   3. A player who plays only the story is never stuck: every day either a job
//      can start or Z takes them to the morning the next one opens, in one sleep.
//   4. Every free-roam line names a thing to do and a key.
//   5. Easy and hard summers finish too; sleeping never runs past Labour Day.
import { ALL_MISSIONS, nextMission, missionAvailable, missionLockReason } from '../src/game/missions.js';
import * as C from '../src/game/campaign.js';
import * as CAL from '../src/game/calendar.js';
import * as S from '../src/game/summer.js';
import { freeRoamLines } from '../src/game/story.js';
import { PLACES } from '../src/game/places.js';

let fails = 0, n = 0;
const ok = (c, msg, extra = '') => { n++; if (!c) { fails++; console.log('FAIL ' + msg + (extra !== '' ? ' :: ' + JSON.stringify(extra) : '')); } };
const known = (id) => ALL_MISSIONS.some((d) => d.id === id);
const home = PLACES.home;

function newG(difficulty = 'normal') {
  const G = { done: new Set(), difficulty, settings: { lang: 'fr' }, prototype2004: false,
    veh: { x: home.x, z: home.z, speedKmh: 0, vLong: 0 }, parked: {} };
  CAL.startSummer(G);
  return G;
}

// Plays one job the way main.js does it: the job is done, the day is spent.
function play(G, def, log) {
  log.push({ day: Math.floor(G.day), id: def.id });
  G.done.add(def.id);
  CAL.spendDay(G, null);
}

/** Walk a whole summer. `pick(G)` chooses the job to play, or null to sleep. */
function walk(G, pick) {
  const log = [], sleeps = [];
  let nights = 0, worst = 0, guard = 0, finaleDay = null, stuck = null;
  while (!G.done.has(C.FINALE) && guard++ < 400) {
    const def = pick(G);
    if (def) {
      if (def.id === C.FINALE) { finaleDay = G.day; G.day = CAL.LAST; G.lastNight = true; }
      play(G, def, log);
      worst = Math.max(worst, nights); nights = 0;
      continue;
    }
    const block = S.sleepBlock(G);
    if (block) { stuck = { day: G.day, block, done: [...G.done] }; break; }
    const p = S.planSleep(G);
    if (!(p.to > p.from)) { stuck = { day: G.day, why: 'sleep goes nowhere' }; break; }
    sleeps.push(p);
    nights += p.to - p.from;
    S.applySleep(G, p);
    if (CAL.isOver(G.day)) G.lastNight = true;   // main.js runEnding: Labour Day opens the finale
  }
  worst = Math.max(worst, nights);
  return { log, sleeps, worst, finaleDay, stuck };
}

const playedOn = (log, id) => (log.find((r) => r.id === id) || {}).day;

console.log('the dates');
{
  for (const [id, day] of Object.entries(C.DATE_GATES)) {
    ok(known(id), `${id} is a live job`);
    ok(day >= 0 && day <= CAL.LAST, `${id} opens inside the summer (${day})`);
  }
  ok(C.DATE_GATES.arcbache === C.SAINT_JEAN_DAY && CAL.label(C.SAINT_JEAN_DAY) === 'jeu 24 juin', 'the Saint-Jean stays on 24 June');
  ok(CAL.label(C.DATE_GATES.stvincent) === 'ven 30 juill', 'the sauna is the hottest day, 30 July', CAL.label(C.DATE_GATES.stvincent));
  ok(C.DATE_GATES.curfew === CAL.LAST - 1, 'the nachos are the night before Labour Day');
  // Main missions in story order have dates in the same order.
  let prev = -1;
  for (const id of C.mainIds(known)) {
    const d = C.DATE_GATES[id] ?? prev;
    ok(d >= prev, `${id}'s date (${d}) is not before the mission ahead of it (${prev})`);
    prev = d;
  }
  // index.html has the gate now; the prototype keeps only the Saint-Jean.
  const G = { done: new Set(C.mainIds(known).slice(0, 3)), day: 4, prototype2004: false };
  ok(/Pas avant le 2 juillet/.test(C.dateLock(G, 'divan') || ''), 'index.html: the couch waits for 2 July', C.dateLock(G, 'divan'));
  ok(/Pas avant le 2 juillet/.test(missionLockReason(G, ALL_MISSIONS.find((d) => d.id === 'divan')) || ''), 'the pillar says so');
  ok(C.dateLock({ ...G, prototype2004: true }, 'divan') === null, 'the prototype has no date on the couch');
  ok(C.dateLock({ done: G.done }, 'divan') === null, 'no calendar (a node suite with no day), no date gate');
  ok(C.dateLock({ ...G, day: 10 }, 'divan') === null, 'on 2 July it opens');
  ok(C.dateLock({ ...G, day: 60 }, 'divan') === null, 'and a player past the date is never held back');
}

console.log('a player who does each new thing once');
{
  const G = newG();
  const r = walk(G, (g) => { const d = nextMission(g); return d && !g.done.has(d.id) && missionAvailable(g, d) ? d : null; });
  ok(!r.stuck, 'never stuck', r.stuck);
  ok(r.worst <= S.DEAD_STRETCH_MAX, `longest stretch with nothing new: ${r.worst} nights (bar ${S.DEAD_STRETCH_MAX})`, r.worst);
  for (const row of r.log) {
    const from = C.DATE_GATES[row.id];
    if (from != null) ok(row.day >= from, `${row.id} played on day ${row.day}, not before its date ${from}`);
  }
  ok(playedOn(r.log, 'arcbache') === C.SAINT_JEAN_DAY, 'the Saint-Jean is played on the 24th', playedOn(r.log, 'arcbache'));
  ok(r.finaleDay >= CAL.LAST - 1, `the finale starts on Labour Day (day ${r.finaleDay}), not in July`);
  const all = ALL_MISSIONS.filter((d) => !C.isRetired(d.id));
  ok(all.every((d) => G.done.has(d.id)), 'every job got played', all.filter((d) => !G.done.has(d.id)).map((d) => d.id));
  ok(G.day === CAL.LAST, 'the summer ends on Labour Day');
  const mainDays = C.mainIds(known).map((id) => playedOn(r.log, id));
  ok(mainDays[mainDays.length - 1] >= 70 && mainDays[Math.floor(mainDays.length / 2)] >= 26, `the story spans the summer: ${mainDays.join(' ')}`);
  console.log(`  played ${r.log.length} jobs, slept ${r.sleeps.length} times, longest dead stretch ${r.worst} nights`);
  console.log('  ' + r.log.map((x) => `${x.day}:${x.id}`).join(' '));
}

console.log('a player who plays only the story');
{
  const G = newG();
  const r = walk(G, (g) => {
    const id = C.nextMain(g.done, known) || (!g.done.has(C.FINALE) ? C.FINALE : null);
    const d = id && ALL_MISSIONS.find((x) => x.id === id);
    return d && missionAvailable(g, d) ? d : null;
  });
  ok(!r.stuck, 'never stuck', r.stuck);
  // Each wait for a date is one sleep: Z goes to the morning the next thing opens.
  for (const p of r.sleeps) ok(p.nights >= 1 && p.to <= CAL.LAST, `a sleep from ${p.from} to ${p.to}`);
  const mains = C.mainIds(known).length;
  ok(r.sleeps.length <= mains + 6, `${r.sleeps.length} sleeps for the whole story (one per opening, not one per night)`);
  ok(r.finaleDay >= CAL.LAST - 1, `finale on Labour Day (${r.finaleDay})`);
}

console.log('always something to do, and a key');
{
  const G = newG();
  let seen = 0, wait = 0;
  walk(G, (g) => {
    const l = freeRoamLines(g, null);
    seen++;
    ok(l && l.text && /\b(E|Z)\b/.test(l.sub || ''), `day ${Math.floor(g.day)}: « ${l && l.text} » names a key`, l);
    if (l.kind === 'wait') { wait++; ok(/Z au 299 Fraser/.test(l.sub) && /Prochaine histoire/.test(l.text), 'the wait line says when and how', l); }
    const d = nextMission(g);
    return d && !g.done.has(d.id) && missionAvailable(g, d) ? d : null;
  });
  ok(wait > 0, `the wait line shows (${wait} of ${seen} looks)`);
  // The sleep hint at home, and only at home, parked.
  const H = newG();
  H.done.add('alternateur'); H.done.add('sayyad'); H.done.add('arcbache'); H.day = 7;
  for (const id of ['dep', 'margaretdental', 'gang', 'racecivic', 'solerrand']) H.done.add(id);
  ok(S.sleepHint(H) === 'Z : dormir jusqu’au 2 juillet', 'parked at home with nothing open: « Z : dormir jusqu’au 2 juillet »', S.sleepHint(H));
  ok(S.sleepHint({ ...H, veh: { x: home.x + 400, z: home.z, speedKmh: 0 } }) === '', 'not away from home');
  ok(S.sleepHint({ ...H, veh: { x: home.x, z: home.z, speedKmh: 30 } }) === '', 'not while driving');
  ok(S.sleepHint({ ...H, mission: {} }) === '', 'not during a job');
  ok(S.sleepBlock({ ...H, day: CAL.LAST, lastNight: true }) != null, 'not on the last night');
  ok(S.sleepBlock({ ...H, prototype2004: true }) === 'proto', 'not in the prototype');
  const p = S.planSleep(H);
  ok(p.to === 10 && p.nights === 3 && /Les jours passent/.test(p.title) && /Aujourd’hui : Le divan de Mike/.test(p.task), 'the sleep card', p);
  ok(!/[–—]/.test(p.title + p.body + p.task), 'no dashes in the sleep card');
  H.done.delete('solerrand');
  ok(S.sleepTarget(H) === 10, 'with a job open, the sleep still goes to the next opening');
  S.applySleep(H, S.planSleep(H));
  ok(missionAvailable(H, ALL_MISSIONS.find((d) => d.id === 'solerrand')) && missionAvailable(H, ALL_MISSIONS.find((d) => d.id === 'divan')), '...and the job that was open is still open, with the couch');
  ok(/Prochaine histoire : le 2 juillet/.test(S.nextStoryNote({ ...H, day: 7 })), 'the end card says when the story comes back');
}

console.log('sleep is not re-entrant (W7-BUGS)');
{
  // Red team 20 Oct item 3: Z could open the sleep card over another card
  // (a job's end card, the ending, a menu) and replace its onDone.
  const H = newG();
  H.done.add('alternateur'); H.done.add('sayyad'); H.done.add('arcbache'); H.day = 7;
  for (const id of ['dep', 'margaretdental', 'gang', 'racecivic', 'solerrand']) H.done.add(id);
  ok(S.sleepBlock(H) === null && S.sleepBlock(H, { card: false }) === null, 'parked at home, nothing up: Z sleeps');
  ok(S.sleepBlock(H, { card: true }) === 'card', 'a card or menu owns the screen: Z is refused');
  ok(S.SLEEP_SILENT.has('card') && S.SLEEP_SILENT.has('proto'), '...silently (no toast over the card)');
  ok(S.sleepHint(H) !== '', 'the hint is unchanged when nothing is up');
  // The same card's onDone twice (a double click, a pad A and Enter in one
  // frame) moves the calendar once.
  const p = S.planSleep(H);
  ok(S.applySleep(H, p) === true && H.day === 10, 'Debout: the morning of the 2nd', H.day);
  ok(S.applySleep(H, p) === false && H.day === 10, 'a second Debout on the same card moves nothing', H.day);
  // main.js builds the card flag from every screen owner, and checks it first.
  const { readFileSync } = await import('node:fs');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const body = main.slice(main.indexOf('function trySleep()'), main.indexOf('// ---- S4-SUMMER sleep (end) ----'));
  for (const owner of ['cinema.active', 'story.active', 'endingCard.active', 'modalOpen()', 'G.seamHold', 'G.mealShift', "G.mode !== 'drive'"]) {
    ok(body.includes(owner), `trySleep counts ${owner} as a card`);
  }
  ok(/sleepBlock\(G, \{ card \}\)/.test(body) && body.indexOf('sleepBlock(') < body.indexOf('cinema.show('), 'trySleep asks sleepBlock with the card flag before showing anything');
  ok(/if \(!summer\.applySleep\(G, plan\)\) return;/.test(body), 'the card applies its plan once');
}

console.log('a sleep pays an owed day (W7-BUGS)');
{
  // Red team 20 Oct item 4: a paid job's first fail defers its day
  // (calendar.deferDay, while the R offer is up); a sleep used to wipe it.
  const R = await import('../src/game/retry.js');
  const base = () => {
    const H = newG();
    H.done.add('alternateur'); H.done.add('sayyad'); H.done.add('arcbache'); H.day = 7;
    for (const id of ['dep', 'margaretdental', 'gang', 'racecivic', 'solerrand']) H.done.add(id);
    return H;
  };
  const A = base();
  const plain = S.sleepTarget(A);
  ok(plain === 10 && S.owedDays(A) === 0, 'nothing owed: the sleep goes to the next opening', plain);
  const B = base(); CAL.deferDay(B);
  ok(S.owedDays(B) === 1 && S.sleepTarget(B) === plain + 1, 'one day owed: one more night than without', S.sleepTarget(B));
  const pB = S.planSleep(B);
  ok(pB.owed === 1 && /\+1 jour : la job ratée/.test(pB.task) && !/[–—]/.test(pB.task), 'the sleep card says the owed day', pB.task);
  // main.js's order: applySleep, then cancelRetry (its settleDay must find nothing left).
  B.retry = { deferred: true, left: 30, free: true };
  S.applySleep(B, pB);
  const moved = R.cancelRetry(B);
  ok(B.day === plain + 1 && !B.dayOwed && !B.retry && moved, 'after Debout: day paid once, offer gone, nothing owed', { day: B.day, owed: B.dayOwed });
  // Fail, sleep one night: the summer is shorter than with no fail.
  const D = base(); D.done.delete('solerrand');
  const E0 = base(); E0.done.delete('solerrand');
  CAL.deferDay(D);
  S.applySleep(D, S.planSleep(D)); R.cancelRetry(D);
  S.applySleep(E0, S.planSleep(E0));
  ok(D.day === E0.day + 1, 'a failed job still costs its day across a sleep', { failed: D.day, clean: E0.day });
  // Never past Labour Day.
  const L = base(); L.day = CAL.LAST - 1; CAL.deferDay(L); CAL.deferDay(L);
  ok(S.sleepTarget(L) === CAL.LAST, 'owed days stop at Labour Day', S.sleepTarget(L));
  const { readFileSync } = await import('node:fs');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const body = main.slice(main.indexOf('function trySleep()'), main.indexOf('// ---- S4-SUMMER sleep (end) ----'));
  ok(body.indexOf('cancelRetry(G)') > body.indexOf('applySleep(G, plan)'), 'trySleep drops the R offer only after the plan is applied (it used to settle first, then the night swallowed the day)');
}

console.log('easy and hard summers');
for (const diff of ['easy', 'hard']) {
  const G = newG(diff);
  const r = walk(G, (g) => { const d = nextMission(g); return d && !g.done.has(d.id) && missionAvailable(g, d) ? d : null; });
  ok(!r.stuck && G.done.has(C.FINALE), `${diff}: the summer finishes`, r.stuck);
  ok(r.finaleDay >= CAL.LAST - 1, `${diff}: finale on Labour Day (${r.finaleDay})`);
  ok(r.worst <= S.DEAD_STRETCH_MAX + 1, `${diff}: longest stretch ${r.worst} nights`);
}

console.log('the finale counts the summer places, and lights the ones left');
{
  const A = await import('../src/game/arc.js');
  const def = ALL_MISSIONS.find((d) => d.id === C.FINALE);
  const stages = def.build({});
  const objs = [];
  const G = { veh: { x: home.x, z: home.z }, hud: { setObjective: (t, sub) => objs.push([t, sub]), toast: () => {} }, cops: { clear() {} } };
  const m = { def, stages, idx: 0 };
  A.finaleTick(G, m);
  const total = A.FINALE_CALLBACKS.length;
  ok(m.fin.todo.length === total, `every place is lit at the start (${m.fin.todo.length}/${total})`);
  const tyler = PLACES.tyler;
  G.veh = { x: tyler.x, z: tyler.z };
  A.finaleTick(G, m);
  ok(m.fin.seen.has('tyler') && m.fin.todo.length === total - 1 && !m.fin.todo.some((p) => p.at === 'tyler'), 'a place seen goes dark');
  const last = objs[objs.length - 1] || [];
  ok(new RegExp(`1/${total} places de l’été`).test(last[0] || ''), `the objective counts: « ${last[0]} »`);
  ok(/Rentre quand t’es prêt/.test(last[1] || '') && m.fin.left, 'once you have left, the sub says the lights are the summer', last);
  for (const c of A.FINALE_CALLBACKS) { const p = PLACES[c.at]; G.veh = { x: p.x, z: p.z }; A.finaleTick(G, m); }
  ok(m.fin.todo.length === 0 && /T’as fait le tour/.test((objs[objs.length - 1] || [])[1] || ''), 'all seen: « T’as fait le tour »');
  ok(!objs.some(([t, sub]) => /[\u2013\u2014]/.test(t + sub)), 'no dashes in the finale objective lines');
}

console.log('the summer-end screen');
{
  const G = newG();
  for (const d of ALL_MISSIONS) G.done.add(d.id);
  G.stats = { dist: 1234567, jumps: 23, bigAir: 2.14, crashes: 7, nearMiss: 41 };
  G.best = { sayyad: 72.4, divan: 95 };
  G.wallet = { value: 412 };
  G.streets = new Set();
  const card = S.summerSummary(G, { courseBests: { bz_vieux: 118 }, courseName: () => 'Blitz du Vieux' });
  const all = [card.eyebrow, card.title, card.body, card.task, card.note, card.button].join('\n');
  ok(card.title === 'Ton été' && /C’était ça, l’été/.test(card.body), 'title and the narrator, French', card);
  ok(/Histoire 10\/10/.test(card.task) && /1\u202f235 km/.test(card.task) && /Sauts 23, le plus long 2,1 s/.test(card.task) && /accidents 7/.test(card.task), 'missions, km, jumps, crashes', card.task);
  ok(/Records : 2 jobs, 1 course {2}·  Blitz du Vieux 1:58/.test(card.task) && /412 \$/.test(card.task) && /Le divan : encore dans l’arbre/.test(card.task), 'records, money, the couch', card.task);
  ok(!/[\u2013\u2014]/.test(all), 'no em or en dash anywhere on the screen');
  ok(card.lines.length <= 7, `short: ${card.lines.length} lines`);
  const en = S.summerSummary({ ...G, settings: { lang: 'en' } }, {});
  ok(en.title === 'Your summer' && /Story 10\/10/.test(en.task) && /C’était ça, l’été/.test(en.body), 'English HUD, French narrator', en);
}

console.log(fails ? `FAIL ${fails} of ${n}` : `PASS summer pacing: ${n} checks`);
if (fails) process.exit(1);
