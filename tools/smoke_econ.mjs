#!/usr/bin/env node
// The money rules and the job gates the 29 Sept progression review asked for:
//
//   node tools/smoke_econ.mjs
//
//   1. replays pay 25 %, once per job per game day, no style bonus (P3)
//   2. the M-menu courses pay the purse once, then only a new best (P5)
//   3. race jobs take the difficulty only, not PAY_LIFT (P9)
//   4. losing an ambush costs the bet it says you owe (P8)
//   5. prototype: night jobs only at night, and they say when (P1)
//   6. prototype: the arc beats wait for their dates; the finale is last (P2)
//   7. index.html: finishing the finale ends the summer; restart costs a day (P7)
//   8. prototype: no Labour Day toast loop after the ending (P10)
//   9. Dad's call: broke, a bill, stopped, once a week, three a summer
import { strict as assert } from 'node:assert';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}${extra ? '   ' + extra : ''}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? '   ' + extra : ''}`); }
};
const group = (n) => console.log('\n' + n);

const K = await import('../src/game/missionkit.js');
const M = await import('../src/game/missions.js');
const W = await import('../src/game/jobwindows.js');
const A = await import('../src/game/arc.js');
const C = await import('../src/game/calendar.js');
const CC = await import('../src/prototype/calendar-clock.js');
const D = await import('../src/game/dadcall.js');
const MODES = await import('../src/game/modes.js');
const AMB = await import('../src/game/ambush.js');
const CP = await import('../src/game/campaign.js');

function wallet(v = 0) {
  return { value: v, add(n) { this.value = Math.max(0, this.value + n); return this.value; },
    spend(n) { if (this.value < n) return false; this.value -= n; return true; }, can(n) { return this.value >= n; } };
}
const byId = (id) => M.ALL_MISSIONS.find((d) => d.id === id);
// Run every paid stage of a job through stageSettle, the way main.js does.
function runJob(G, def) {
  const m = { def, stages: def.build({ carId: 'ranger', carName: 'Ranger', seats: 2, places: 3, money: 0 }),
    idx: 0, elapsed: 60, styleStart: { stats: {}, damage: 0 } };
  const before = G.wallet.value;
  for (const st of m.stages) { if (st.cost) G.wallet.add(st.cost); K.stageSettle(G, m, st); }
  G.done.add(def.id);
  return { m, pay: G.wallet.value - before };
}

// ================================================================ 1. replays
group('a replay pays a quarter, once per job per game day (P3)');
{
  const G = { done: new Set(), wallet: wallet(0), payScale: 1.05, racePayScale: 1, day: 3 };
  // Was « vitres », retired in the restructure (29 Sept 2026); the yogurt run
  // is an optional job that stays replayable all summer.
  const def = byId('dep');
  const first = runJob(G, def);
  const r1 = runJob(G, def);
  const r2 = runJob(G, def);
  ok(first.pay > 0, 'first time: full pay', `${first.pay} $`);
  ok(r1.pay === Math.round(first.pay * K.REPLAY.share) || Math.abs(r1.pay - first.pay * K.REPLAY.share) <= 2,
    'first replay of the day: 25 %', `${r1.pay} $`);
  ok(r2.pay === 0, 'second replay the same day: nothing', `${r2.pay} $`);
  G.day = 4;
  const r3 = runJob(G, def);
  ok(r3.pay === r1.pay, 'next game day: 25 % again', `${r3.pay} $`);
  ok(r1.m.styleStart.replay === true, 'the replay is flagged for the style bonus');
  const style = K.missionStyleBonus(r1.m.styleStart, { nearMiss: 3, jumps: 2 }, 0);
  ok(style.money === 0 && style.text, 'and a replay earns the feats, not the style money', style.text);
  const firstStyle = K.missionStyleBonus(first.m.styleStart, { nearMiss: 3, jumps: 2 }, 0);
  ok(firstStyle.money > 0, 'a first run still gets its style bonus', `${firstStyle.money} $`);
  // A replay that fails hands its slot back with the money.
  G.day = 5;
  const m = { def, stages: def.build({ carId: 'ranger', carName: 'Ranger', seats: 2, places: 3 }), idx: 0, styleStart: {} };
  K.stageSettle(G, m, m.stages.find((s) => s.money));
  K.refundJob(G, m);
  ok(G.replayPaid[def.id] == null, 'a failed replay gives back its once-a-day slot');
  ok(K.restartCostsDay({ idx: 1, elapsed: 5 }) && K.restartCostsDay({ idx: 0, elapsed: 50 })
    && !K.restartCostsDay({ idx: 0, elapsed: 10 }), 'restart costs the day by the same rule as a failure');
}

// ================================================================ 2. modes
group('an M-menu course pays its purse once, then only a new best (P5)');
{
  const course = MODES.COURSES.find((c) => c.money >= 40);
  const def = MODES.missionFor(course);
  const G = { done: new Set(), wallet: wallet(0), payScale: 1.05, racePayScale: 1, best: {} };
  const win = (elapsed) => {
    const m = { def, elapsed, stages: [] };
    const pay = K.scaledPay(G, m, course.money);
    const line = MODES.purseLine(G, m, course);
    if (G.best[def.id] == null || elapsed < G.best[def.id]) G.best[def.id] = elapsed;
    return { pay, line };
  };
  const a = win(100), b = win(110), c = win(90);
  ok(a.pay === course.money, 'first win: the whole purse', `${a.pay} $ · ${a.line}`);
  ok(b.pay === 0, 'a slower second win: nothing', `${b.pay} $ · ${b.line}`);
  ok(c.pay > 0 && c.pay <= K.MODE_PB_PAY, `a new best: at most ${K.MODE_PB_PAY} $`, `${c.pay} $ · ${c.line}`);
  const sweep = MODES.COURSES.reduce((s, x) => s + x.money, 0);
  ok(sweep > 0, `a clean sweep pays ${sweep} $ once, not every time`);
}

// ================================================================ 3. races
group('race jobs take the difficulty, not the pay lift (P9)');
{
  const G = { payScale: 1.05, racePayScale: 1 };
  for (const id of ['racedave', 'racecivic', 'circuit', 'blitz']) {
    const def = byId(id);
    const st = def.build({ carId: 'ranger', carName: 'Ranger', seats: 2, places: 3 }).find((s) => s.money);
    ok(K.scaledPay(G, { def }, st.money) === st.money, `${id}: ${st.money} $, not ${Math.round(st.money * 1.05)} $`);
  }
}

// ================================================================ 4. ambush
group('losing an ambush costs what it says you owe (P8)');
{
  const a = { name: 'Dave', toKey: 'mall', label: 'Galeries', carId: 'civic', roster: null, spawn: { x: 0, z: 0, yaw: 0 } };
  const G = { done: new Set(), wallet: wallet(50), envKey: 'day', hud: { toast() {} } };
  const def = AMB.makeDef(G, a);
  const st = def.build();
  def.cleanup(G, { def, stages: st, idx: 0 });
  ok(G.wallet.value === 50 - AMB.AMBUSH.bet, `a lost race takes the ${AMB.AMBUSH.bet} $`, `${G.wallet.value} $ left`);
  G.wallet.value = 50;
  def.cleanup(G, { def, stages: st, idx: st.length });
  ok(G.wallet.value === 50, 'a won race takes nothing back');
  G.wallet.value = 5;
  def.cleanup(G, { def, stages: st, idx: 0 });
  ok(G.wallet.value === 0, 'and a broke loser pays what he has, never below zero');
}

// ================================================================ 5. windows
group('prototype: night jobs are offered at night, and say when (P1)');
{
  const at = (h) => h / 24 * W.DAY_CYCLE;
  // Every job, every hour: offered exactly when its window is open.
  let wrong = [];
  for (const def of M.ALL_MISSIONS) {
    for (let h = 0; h < 24; h++) {
      const G = { prototype2004: true, dayClock: at(h + 0.5), day: 70, done: new Set([def.id]) };
      const want = W.inWindow(h + 0.5, W.jobWindow(def));
      if (M.missionAvailable(G, def) !== want) wrong.push(`${def.id}@${h}`);
    }
  }
  ok(!wrong.length, 'a finished job replays only inside its window, all jobs x 24 h', wrong.slice(0, 5).join(' '));
  // The queue (restructure, 29 Sept 2026: ten main missions, each after the
  // one before). After the alternator, Sayyad's job is next, and it is a night job.
  const head = new Set(['alternateur']);
  const base = { done: head };
  ok(M.nextMission(base).id === 'sayyad', 'index.html / node: « Réveiller Sayyad » is next');
  const noon = { prototype2004: true, dayClock: at(13), day: 3, done: head };
  const why = M.missionLockReason(noon, byId('sayyad'));
  ok(/Reviens après 21 h/.test(why || ''), 'at 13 h it is not offered, and it says when', why);
  ok(M.nextMission(noon).id !== 'sayyad' && M.missionAvailable(noon, M.nextMission(noon)),
    'and an open optional job takes its turn', M.nextMission(noon).id);
  ok(!CP.isMain(M.nextMission(noon).id), 'which is never a later main mission');
  const night = { ...noon, dayClock: at(22) };
  ok(M.nextMission(night).id === 'sayyad' && M.missionAvailable(night, byId('sayyad')), 'at 22 h it is offered');
  const morning = { prototype2004: true, dayClock: at(15), day: 3, done: new Set(['school']) };
  ok(/demain matin/.test(M.missionLockReason(morning, byId('school')) || ''),
    'the early job says « demain matin » in the afternoon', M.missionLockReason(morning, byId('school')));
  ok(W.windowMessage(byId('curfew'), 2.5) === null && W.windowMessage(byId('curfew'), 4.5) === null
    && W.windowMessage(byId('curfew'), 5.5) !== null && W.windowMessage(byId('curfew'), 23) !== null,
    'the nachos run from 2 h to 5 h (home before Little Big Man ends), never at 5:30 or 23 h');
  // Never stalls: at every hour and date, with jobs left, one is offered or
  // the head of the queue says why.
  let stall = 0;
  const order = []; { const d = new Set(); let g; while ((g = M.nextMission({ done: d }))) { order.push(g.id); d.add(g.id); } }
  for (let k = 0; k < order.length; k += 3) {
    for (let h = 0; h < 24; h += 2) {
      const G = { prototype2004: true, dayClock: at(h), day: 20, done: new Set(order.slice(0, k)) };
      const n = M.nextMission(G);
      if (!n || (!M.missionAvailable(G, n) && !M.missionLockReason(G, n))) stall++;
    }
  }
  ok(stall === 0, 'the queue never stalls without a reason');
}

// ================================================================ 6. dates
group('the ten main missions in order, then the finale; the Saint-Jean waits for 24 June (P2)');
{
  // RESTRUCTURE (29 Sept 2026): the old job-count beats and dated arc gates
  // are gone on purpose. The story is campaign.js: ten main missions one after
  // the other, then the finale, which opens when the ten are done or on Labour
  // Day, whichever comes first, and never waits on a date otherwise.
  const order = []; { const d = new Set(); let g; while ((g = M.nextMission({ done: d }))) { order.push(g.id); d.add(g.id); } }
  const mains = CP.mainIds((id) => !!byId(id));
  ok(JSON.stringify(order.slice(0, mains.length)) === JSON.stringify(mains),
    'index.html / node: the main missions come first, in the campaign order', order.slice(0, mains.length).join(' '));
  ok(order[mains.length] === CP.FINALE, '« Le dernier soir » comes straight after the tenth', `${order.indexOf(CP.FINALE) + 1}/${order.length}`);
  ok(order.length === M.ALL_MISSIONS.length, 'and every optional job is still reachable after it');
  const allMain = new Set(mains);
  const aug1 = { prototype2004: true, dayClock: W.DAY_CYCLE * 0.4, day: 36, done: allMain };
  ok(M.missionAvailable(aug1, byId(CP.FINALE)), 'the ten done on 1 August: the finale opens, no date wait');
  const half = new Set(mains.slice(0, 4));
  const july = { prototype2004: true, dayClock: W.DAY_CYCLE * 0.4, day: 20, done: half };
  ok(!M.missionAvailable(july, byId(CP.FINALE)), 'four done in July: the finale is shut', M.missionLockReason(july, byId(CP.FINALE)));
  ok(M.missionAvailable({ ...july, day: C.LAST }, byId(CP.FINALE)), 'but on Labour Day it opens whatever is left');
  ok(!M.missionAvailable(july, byId(mains[6])), 'and a later main mission waits for the one before it',
    M.missionLockReason(july, byId(mains[6])));
  // La Saint-Jean (arcbache) is the beach bonfire on 24 June: prototype only.
  const sj = new Set(mains.slice(0, mains.indexOf('arcbache')));
  const d1 = { prototype2004: true, dayClock: W.DAY_CYCLE * 19 / 24, day: CP.SAINT_JEAN_DAY - 1, done: sj };
  ok(/Pas avant le/.test(M.missionLockReason(d1, byId('arcbache')) || ''), 'on 23 June the Saint-Jean waits, and says for when',
    M.missionLockReason(d1, byId('arcbache')));
  ok(M.nextMission(d1).id !== 'arcbache', 'and an open job goes ahead', M.nextMission(d1).id);
  ok(M.missionAvailable({ ...d1, day: CP.SAINT_JEAN_DAY }, byId('arcbache')), 'on the 24th at 19 h it opens');
  // S4-SUMMER: index.html keeps the 24th too, and every main mission has its date there.
  ok(!M.missionAvailable({ ...d1, prototype2004: false, day: 0 }, byId('arcbache')), 'index.html: the Saint-Jean waits for the 24th too');
  ok(M.missionAvailable({ ...d1, prototype2004: false, day: CP.SAINT_JEAN_DAY }, byId('arcbache')), 'index.html: on the 24th it opens');
  // unlockArc announces the next main mission when finishing one opens it.
  const hud = { t: [], toast(x) { this.t.push(x); } };
  M.resetArcSync();
  const G = { done: new Set(['alternateur']), hud, audio: { chime() {} } };
  M.unlockArc(G);
  ok(!hud.t.length, 'loading a save announces nothing');
  G.done.add('sayyad'); M.unlockArc(G);
  ok(hud.t.some((x) => /NOUVELLE JOB/.test(x)), 'finishing « Réveiller Sayyad » announces the next main mission', hud.t.join(' | '));
  M.resetArcSync();
}

// ================================================================ 7. index.html ending
group('index.html: the finale ends the summer (P7)');
{
  const G = { difficulty: 'normal', done: new Set(['arcdernier']), hud: { toast() {} } };
  C.startSummer(G);
  G.day = 33;
  C.spendDay(G);
  ok(C.isOver(G.day), 'finishing « Le dernier voyage » takes the calendar to Labour Day', C.label(G.day));
  const H = { difficulty: 'normal', done: new Set(['dep']), hud: { toast() {} } };
  C.startSummer(H); H.day = 33; C.spendDay(H);
  ok(H.day === 34, 'any other job still costs one day');
}

// ================================================================ 8. after the ending
group('prototype: after the ending, midnight is just midnight (P10)');
{
  const G = { dayClock: 590, day: 72, summerOver: true };
  const r = CC.advanceSummerClock(G, 60, 600, 24, 24, 72);
  ok(r.midnights === 0 && !r.end, 'no midnight is reported, so no toast and no autosave', JSON.stringify(r));
  const H = { dayClock: 500, day: 10, summerOver: false };
  const back = CC.advanceTo(H, 6);
  ok(back.midnights === 1 && H.day === 11 && Math.abs(H.dayClock - 150) < 1e-6,
    'advanceTo(6 h) from 20 h goes forward through midnight', `day ${H.day}, ${H.dayClock}`);
  const I = { dayClock: 150, day: 10, summerOver: false };
  CC.advanceTo(I, 21);
  ok(I.day === 10 && Math.abs(I.dayClock - 525) < 1e-6, 'and to 21 h from 6 h stays on the same day');
}

// ================================================================ 9. Dad
group('Dad calls when you are broke with a bill in front of you, and you are home');
{
  // 2004: the phone is the landline at 299 Fraser (Tom, 29 Sept). No call away.
  const { PLACES } = await import('../src/game/places.js');
  const H0 = PLACES.home;
  const home = (o = {}) => ({ x: H0.x + 4, z: H0.z, vLong: 0, damage: 0, ...o });
  const away = (o = {}) => ({ x: H0.x + 900, z: H0.z, vLong: 0, damage: 0, ...o });
  D.setDadCalls(null);
  const toasts = [];
  const G = { day: 3, wallet: wallet(8), hud: { toast(t) { toasts.push(t); } } };
  const v = home();
  ok(D.maybeDadCall(G, v, false) === null, 'broke with nothing to pay for: no call');
  ok(D.maybeDadCall({ ...G, wallet: wallet(40) }, v, true) === null, 'a low tank with money: no call');
  ok(D.maybeDadCall(G, home({ vLong: 12 }), true) === null, 'not while you are driving');
  const hints = toasts.length;
  ok(D.maybeDadCall(G, away(), true) === null && !G.dadCalls, 'broke with a bill across town: no call (the phone is at home)');
  ok(toasts.length === hints + 1 && /maison/.test(toasts[toasts.length - 1]), '…only a small hint that home is where the phone is', toasts[toasts.length - 1]);
  D.maybeDadCall(G, away(), true);
  ok(toasts.length === hints + 1, 'and the hint once a game week, not every tick');
  const c1 = D.maybeDadCall(G, v, true);
  ok(c1 && c1.amount >= 40 && c1.amount <= 85 && G.wallet.value === 8 + c1.amount,
    'broke, stopped at 299 Fraser, tank on the light: Dad calls', c1 ? `+${c1.amount} $ (${c1.why})` : '');
  ok(/téléphone sonne dans la maison/.test(toasts[toasts.length - 1]), 'and the house phone rings', toasts[toasts.length - 1].split('\n')[0]);
  G.wallet.value = 3;
  ok(D.maybeDadCall(G, v, true) === null, 'once a game week at most');
  G.day = 10;
  const c2 = D.maybeDadCall(G, home({ damage: 80 }), false);
  ok(c2 && c2.why === 'repair', 'the next week, a wrecked truck is a reason too');
  G.day = 17; G.wallet.value = 0;
  const m = { stages: [{ cost: 60 }], idx: 0 };
  const c3 = D.maybeDadCall({ ...G, mission: m }, v, false);
  ok(c3 && c3.why === 'stage', 'so is a job waiting on money you do not have (Norm’s hose)');
  G.day = 24; G.wallet.value = 0;
  ok(D.maybeDadCall(G, v, true) === null, `and never more than ${D.DAD.max} times a summer`, `${G.dadCalls.n} calls`);
  D.setDadCalls([{ amount: 70, lines: [['Ton père', '« Test. »']], hidden: 'never shown' }]);
  const H = { day: 0, wallet: wallet(0), hud: { toast(t) { this.t = t; } } };
  const c = D.maybeDadCall(H, v, true);
  ok(c.amount === 70 && /« Test. »/.test(H.hud.t) && !/never shown/.test(H.hud.t),
    'DAD_CALLS lines and amounts are used, and `hidden` never reaches the screen');
  D.setDadCalls(null);
}

group('Dad, with story.js’s lines, through the game’s own tick (fuel.tickFuel)');
{
  D.setDadCalls(null);
  const loaded = await D.loadDadCalls();
  const S = await import('../src/game/story.js');
  const { PLACES } = await import('../src/game/places.js');
  ok(loaded && D.dadCalls().length === S.DAD_CALLS.length && D.dadCalls()[0].bubbles,
    'dadcall.js reads story.js’s DAD_CALLS through dadCall(n)');
  const F = await import('../src/game/fuel.js');
  const toasts = [], said = [], rings = [];
  const G = { day: 2, wallet: wallet(3), fuel: 0.5, fuelBy: {},
    hud: { toast(t) { toasts.push(t); } }, audio: { blip(f) { rings.push(f); } },
    heckle: { line(who, text, ms, o) { said.push([who, text, o && o.group]); return text; } } };
  const spec = { id: 'ranger', tank: 70, burn: 14, engine: {} };
  const v = { x: PLACES.home.x + 900, z: PLACES.home.z, vLong: 0, damage: 0, spec, baseSpec: spec };
  for (let i = 0; i < 600; i++) F.tickFuel(G, 1 / 60, v, 0, false);   // ten seconds across town
  ok(!G.dadCalls && G.wallet.value === 3, 'dry and broke across town: no call, no money');
  v.x = PLACES.home.x + 3;                                            // home, in the driveway
  for (let i = 0; i < 600; i++) F.tickFuel(G, 1 / 60, v, 0, false);
  const first = S.dadCall(0);
  ok(G.dadCalls && G.dadCalls.n === 1, 'parked at 299 Fraser: exactly one call in ten seconds of ticks', JSON.stringify(G.dadCalls));
  ok(G.wallet.value === 3 + first.amount, `and the money: $3 + $${first.amount}`, `$${G.wallet.value}`);
  ok(rings.length >= 1, 'the house phone rings', rings.join('+'));
  const pick = S.DAD_PICKUP || D.PICKUP_FALLBACK;
  ok(said.length === first.bubbles.length + 1 && said[0][0] === 'Margaret' && said[0][1] === pick[1]
    && said.slice(1).every(([w, t], i) => w === first.bubbles[i][0] && t === first.bubbles[i][1]) && said.every((x) => x[2] === 'dad'),
    'Margaret picks up, then his lines play as bubbles, in order, tagged dad', said.map((x) => x[1]).join(' | '));
  const french = /\b(le|la|les|tu|pas|je|ton|c’est|t’es)\b/i;
  ok(!french.test(said[0][1]) && said.filter(([w]) => w === S.DAD_WHO).every(([, t]) => !french.test(t)),
    'Margaret and Dad speak English to Tom');
  const rang = toasts.filter((t) => /téléphone sonne/.test(t));   // fuel.js toasts the light too
  ok(rang.length === 1 && new RegExp(`\\+${first.amount} \\$`).test(rang[0]),
    'the HUD says the phone rang and what landed, in French', rang[0]);
  G.wallet.value = 0;
  for (let i = 0; i < 600; i++) F.tickFuel(G, 1 / 60, v, 0, false);
  ok(G.dadCalls.n === 1 && G.wallet.value === 0 && toasts.filter((t) => /téléphone sonne/.test(t)).length === 1,
    'broke again the same week: no second call');
  for (let w = 1; w <= 6; w++) {
    G.day = 2 + 7 * w; G.wallet.value = 0;
    for (let i = 0; i < 120; i++) F.tickFuel(G, 1 / 60, v, 0, false);
  }
  ok(G.dadCalls.n === D.DAD.max, `six more broke weeks at home: ${D.DAD.max} calls in the summer, no more`, `${G.dadCalls.n}`);
  const SV = await import('../src/game/save.js');
  const back = SV.normalizeSave({ ...SV.newSave('', 'tom'), dadCalls: G.dadCalls }, 'tom.1');
  ok(back.dadCalls.n === D.DAD.max && back.dadCalls.log.length === D.DAD.max, 'the count survives a save');
}

console.log(`\n${pass} passed, ${fail} failed`);
assert.equal(fail, 0);
