// The spine (Wave 2a): the calendar, the pay scale, the refund, the endings,
// and gas — the numbers docs/PLAN.md's budget table promises, checked against
// the code rather than remembered.
//
//   node tools/smoke_spine.mjs

import { strict as assert } from 'node:assert';

let failed = 0;
const ok = (name, fn) => {
  try { fn(); console.log('ok   ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + '\n     ' + (e.message || e)); }
};

const cal = await import('../src/game/calendar.js');
const fuel = await import('../src/game/fuel.js');
const { stageSettle, refundJob, scaledPay } = await import('../src/game/missionkit.js');
const { endingCards } = await import('../src/game/story.js');

// A wallet with the real API and nothing else.
const wallet = (v) => ({ value: v, can(c) { return this.value >= c; },
  spend(c) { if (!this.can(c)) return false; this.value -= c; return true; },
  add(a) { this.value = Math.max(0, this.value + a); return this.value; } });
const hudSpy = () => { const h = { toasts: [] }; h.toast = (t) => h.toasts.push(t); return h; };

// RESTRUCTURE (29 Sept 2026): the summer starts on Tuesday 22 June so the
// Saint-Jean (24 June) is in it, and the HUD's headline is the days left, not
// the $1,200 envelope. The old 26 June / 73-day / envelope checks are replaced
// on purpose, not loosened.
ok('C1 the summer is 77 days, Tuesday 22 June to Monday 6 September', () => {
  assert.equal(cal.DAYS, 77);
  assert.equal(cal.label(0), 'mar 22 juin');
  assert.equal(cal.label(2), 'jeu 24 juin');          // the Saint-Jean
  assert.equal(cal.label(cal.LAST), 'lun 6 sept');
  assert.equal(cal.iso(cal.LAST), '2004-09-06');
  assert.equal(cal.label(9), 'jeu 1 juill');          // Canada Day
  assert.equal(cal.label(31), 'ven 23 juill');        // Tom's birthday
  assert.equal(cal.daysLeft(0), 76);
  assert.equal(cal.daysLeft(cal.LAST), 0);
  assert.ok(!cal.isOver(75) && cal.isOver(76));
  assert.equal(cal.OLD_START_SHIFT, 4, 'an old 26 June day 0 is day 4 now');
});

ok('C2 hard starts the day after Tom’s birthday; the difficulty table is the plan’s', () => {
  assert.equal(cal.label(cal.DIFF.hard.firstDay), 'sam 24 juill');
  assert.deepEqual(Object.keys(cal.DIFF), ['easy', 'normal', 'hard']);
  assert.equal(cal.DIFF.normal.ticket, 75);
  assert.equal(cal.DIFF.easy.dayCost, 0.5);
  assert.equal(cal.diff({ difficulty: 'nonsense' }), cal.DIFF.normal);
});

ok('C3 a job costs a day, half a day on easy, and Labour Day ends it', () => {
  const G = cal.startSummer({ difficulty: 'normal', hud: hudSpy() });
  assert.equal(G.day, 0);
  assert.ok(cal.spendDay(G));
  assert.equal(G.day, 1);
  assert.equal(G.hud.toasts.length, 1);
  assert.ok(G.hud.toasts[0].startsWith('Mer 23 juin'), G.hud.toasts[0]);
  const E = cal.startSummer({ difficulty: 'easy', hud: hudSpy() });
  // W8-FIRST15: before the Saint-Jean (day 2) a job is a whole day on easy too,
  // so mission 3 is never date-locked; the half days start on the 24th.
  assert.ok(cal.spendDay(E)); assert.equal(E.day, 1); assert.equal(E.hud.toasts.length, 1);
  assert.ok(cal.spendDay(E)); assert.equal(E.day, 2);
  assert.ok(!cal.spendDay(E)); assert.equal(E.day, 2.5); assert.equal(E.hud.toasts.length, 2);
  assert.ok(cal.spendDay(E)); assert.equal(E.day, 3);
  for (let i = 0; i < 200; i++) cal.spendDay(G);
  assert.equal(G.day, cal.LAST, 'the calendar never runs past Labour Day');
  G.summerOver = true;
  assert.ok(!cal.spendDay(G), 'nothing is spent once the summer is over');
});

ok('C4 the HUD headline is the days left; there is no dollar goal', () => {
  const G = cal.startSummer({ difficulty: 'normal', hud: hudSpy(), wallet: wallet(340) });
  const e = cal.envelopeText(G);
  assert.equal(e.amount, '76 jours d’été');
  assert.equal(e.day, 'mar 22 juin · 340 $');
  assert.equal(e.headline, 'days');
  G.wallet.value = 5000;
  assert.ok(!cal.checkReached(G), 'no « objectif atteint » toast, however much is saved');
  assert.ok(!G.reached && G.hud.toasts.length === 0);
  G.day = cal.LAST;
  assert.equal(cal.envelopeText(G).amount, 'Fête du Travail');
  G.summerOver = true;
  assert.equal(cal.envelopeText(G).amount, 'L’été est fini.');
});

ok('C5 the summer file, when present, puts the weather on the toast', () => {
  cal.setSummer(new Map([['2004-07-01', { date: '2004-07-01', tmaxC: 29.4, humidex: 36, sky: 'fair' }]]));
  assert.equal(cal.weatherLine(9), '29°, humidex 36, beau');
  assert.equal(cal.weatherLine(10), '');
  assert.ok(cal.dayToast(9).startsWith('Jeu 1 juill · 29°'));
  assert.ok(cal.dayToast(74).includes('2 jours avant la fête du Travail'));
  // 22-25 June come before the Environment Canada file: a clear sky, no invented numbers.
  assert.equal(cal.dayInfo(2).synthetic, true);
  assert.equal(cal.weatherLine(2), '');
  cal.setSummer(null);
});

ok('P1 jobs take the lift × difficulty, races the difficulty alone, node suites nothing', () => {
  assert.equal(cal.PAY_LIFT, 1.05);
  const G = cal.startSummer({ difficulty: 'normal' });
  assert.ok(Math.abs(G.payScale - 1.05) < 1e-9); assert.equal(G.racePayScale, 1);
  assert.equal(scaledPay(G, { def: {} }, 15), 16);
  assert.equal(scaledPay(G, { def: {} }, 60), 63);
  assert.equal(scaledPay(G, { def: { mode: 'blitz' } }, 90), 90);
  const H = cal.startSummer({ difficulty: 'hard' });
  assert.equal(scaledPay(H, { def: { mode: 'blitz' } }, 90), 72);
  assert.equal(scaledPay({}, { def: {} }, 60), 60, 'no summer, no lift');
  assert.equal(scaledPay(G, { def: {} }, 0), 0);
});

{
  // The budget table, checked against the defs. Outside ok(): the defs pull the map in.
  const { ALL_MISSIONS } = await import('../src/game/missions.js');
  const { COURSES } = await import('../src/game/modes.js');
  const { LIFE_MISSIONS } = await import('../src/game/lifejobs.js');
  const { mainIds, OPTIONAL } = await import('../src/game/campaign.js');
  const lifeIds = new Set(LIFE_MISSIONS.map(d => d.id));
  const G = cal.startSummer({ difficulty: 'normal' });
  let jobs = 0, gross = 0, coreGross = 0;
  for (const def of ALL_MISSIONS) {
    const ctx = { carId: 'ranger', carName: 'Ranger', seats: 2, money: 0 };
    for (const st of def.build(ctx)) {
      const pay = scaledPay(G, { def }, st.money || 0) - (st.cost || 0);
      gross += pay;
      if (!lifeIds.has(def.id)) coreGross += pay;
    }
    jobs++;
  }
  let races = 0;
  for (const c of COURSES) races += scaledPay(G, { def: { mode: c.kind || 'blitz' } }, c.money || 0);
  ok(`P2 one clean pass: ${jobs} jobs net $${gross}, core $${coreGross}, ${COURSES.length} courses $${races}`, () => {
    // RESTRUCTURE (29 Sept 2026): the summer is the ten main missions, the
    // finale and the optional jobs (campaign.js); eleven jobs were cut on
    // purpose, so the old 29 + life count and the $950-1,050 pass (which was
    // sized to fill the $1,200 envelope, no longer a goal) are gone.
    assert.equal(jobs, mainIds((id) => ALL_MISSIONS.some((d) => d.id === id)).length + 1 + Object.keys(OPTIONAL).length);
    assert.ok(gross > 0 && coreGross > 0, `a clean pass still earns something: ${gross} $`);
    assert.ok(gross > coreGross, 'life missions offer additional income');
    assert.equal(races, 435);
  });
}

ok('P3 a failed job hands back what it paid, never below zero, costs stay paid', () => {
  const G = { wallet: wallet(80), payScale: 1.3 };
  const m = { def: {}, idx: 0 };
  stageSettle(G, m, { money: 60 });          // 78 at a 1.3 scale
  stageSettle(G, m, { cost: 10 });
  assert.equal(G.wallet.value, 148);
  assert.equal(m.paid, 68);
  G.wallet.value = 30;                       // spent on gas in between
  assert.equal(refundJob(G, m), 30);
  assert.equal(G.wallet.value, 0);
  assert.equal(refundJob(G, m), 0, 'a second refund is nothing');
});

ok('F1 tanks and burn: the Ranger does about 12.5 L/100 km at half throttle', () => {
  const ranger = { id: 'ranger', mass: 1420 };
  assert.equal(fuel.tankOf(ranger), 62);
  assert.equal(fuel.tankOf({ id: 'dbike' }), 0);
  assert.ok(!fuel.hasTank({ id: 'cart' }));
  const litres = fuel.burn(ranger, 10000, 0.5, 0);
  assert.ok(Math.abs(litres - 1.25) < 0.01, `10 km burned ${litres}`);
  assert.ok(fuel.burn(ranger, 10000, 1, 0) > litres, 'flat out burns more');
});

ok('F2 a new game is half a tank; a friend’s car comes with what is in it; swapping back keeps yours', () => {
  const G = { veh: { spec: { id: 'ranger', mass: 1420 } } };
  fuel.initFuel(G, null);
  assert.equal(G.fuel, 31);
  G.fuel = 20;
  fuel.onSwap(G, { id: 'ranger' }, { id: 'civic' });
  assert.equal(G.fuel, 27);                  // 60 % of 45
  fuel.onSwap(G, { id: 'civic' }, { id: 'ranger' });
  assert.equal(G.fuel, 20);
  fuel.onSwap(G, { id: 'ranger' }, { id: 'dbike' });
  assert.equal(G.fuel, 0);
  const L = { veh: { spec: { id: 'ranger', mass: 1420 } } };
  fuel.initFuel(L, { fuel: 12.5 });
  assert.equal(L.fuel, 12.5);
});

ok('F3 the pump fills what you can pay for, and a dry tank coasts', () => {
  const spec = { id: 'ranger', mass: 1420, accel: 3.5 };
  const G = { veh: { spec, baseSpec: spec, vLong: 0 }, wallet: wallet(1000), hud: hudSpy() };
  fuel.initFuel(G, null);
  const q = fuel.quote(G, spec);
  assert.ok(Math.abs(q.need - 31) < 0.01 && Math.abs(q.cost - 26.32) < 0.01, JSON.stringify(q));
  assert.ok(fuel.fill(G, spec) > 30);
  assert.equal(Math.round(G.fuel), 62);
  assert.equal(G.wallet.value, 974);
  G.fuel = 5; G.wallet.value = 2;            // broke
  assert.ok(fuel.fill(G, spec) < 3);
  G.fuel = 0;
  let dry = null;
  for (let i = 0; i < 3; i++) dry = fuel.tickFuel(G, 1 / 60, G.veh, 1, false);
  assert.ok(dry && dry.accel === 0, 'no engine on a dry tank');
  assert.ok(G.hud.toasts.some((t) => t.startsWith('Panne sèche')));
  // Sitting still on the forecourt for the hold time runs the pump.
  G.wallet.value = 100; G.fuelT = 0; G.veh.vLong = 0;
  for (let i = 0; i < 60 * 3; i++) fuel.tickFuel(G, 1 / 60, G.veh, 0, true);
  assert.ok(G.fuel > 50, `pump filled to ${G.fuel}`);
  // T with a dry tank: the jerrycan, $10 for 5 L; free two litres when broke.
  G.fuel = 0; G.wallet.value = 50;
  assert.ok(fuel.jerrycan(G, spec)); assert.equal(G.fuel, 5); assert.equal(G.wallet.value, 40);
  G.fuel = 0; G.wallet.value = 3;
  assert.ok(fuel.jerrycan(G, spec)); assert.equal(G.fuel, 2);
  assert.ok(!fuel.jerrycan(G, spec), 'not when the tank has something in it');
});

ok('E1 one ending, three cards, the streets counter under the last one', () => {
  // RESTRUCTURE (29 Sept 2026): the ending cannot be failed and says no dollar
  // figure; it is Tom's three cards, and the last carries the streets counter.
  const cards = endingCards({ streets: 'Rues d’Aylmer que tu connais : 42 %' });
  assert.equal(cards.length, 3);
  assert.ok(cards[0].body.includes('on est tous partis'));
  assert.ok(cards[1].body.includes('2011'));
  assert.ok(cards[2].body.includes('solénoïde') && cards[2].body.includes('42 %'));
  assert.ok(!endingCards()[2].body.includes('%'), 'no counter when none is passed');
  for (const c of cards) assert.ok(c.title && !/\$/.test(c.body), `no dollar figure: ${c.body}`);
});

console.log(failed ? `${failed} FAILED` : 'all green');
process.exit(failed ? 1 : 0);
