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

ok('C1 the summer is 73 days, Saturday 26 June to Monday 6 September', () => {
  assert.equal(cal.DAYS, 73);
  assert.equal(cal.label(0), 'sam 26 juin');
  assert.equal(cal.label(cal.LAST), 'lun 6 sept');
  assert.equal(cal.iso(cal.LAST), '2004-09-06');
  assert.equal(cal.label(5), 'jeu 1 juill');          // Canada Day
  assert.equal(cal.label(27), 'ven 23 juill');        // Tom's birthday
  assert.equal(cal.daysLeft(0), 72);
  assert.equal(cal.daysLeft(cal.LAST), 0);
  assert.ok(!cal.isOver(71) && cal.isOver(72));
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
  assert.ok(G.hud.toasts[0].startsWith('Dim 27 juin'));
  const E = cal.startSummer({ difficulty: 'easy', hud: hudSpy() });
  assert.ok(!cal.spendDay(E)); assert.equal(E.day, 0.5); assert.equal(E.hud.toasts.length, 0);
  assert.ok(cal.spendDay(E)); assert.equal(E.day, 1);
  for (let i = 0; i < 200; i++) cal.spendDay(G);
  assert.equal(G.day, cal.LAST, 'the calendar never runs past Labour Day');
  G.summerOver = true;
  assert.ok(!cal.spendDay(G), 'nothing is spent once the summer is over');
});

ok('C4 the envelope text and the moment the number is reached', () => {
  const G = cal.startSummer({ difficulty: 'normal', hud: hudSpy(), wallet: wallet(340) });
  const e = cal.envelopeText(G);
  assert.equal(e.amount, '340 $ / 1\u202f200 $');
  assert.equal(e.day, 'sam 26 juin · 72 jours');
  assert.ok(!cal.checkReached(G));
  G.wallet.value = 1200;
  assert.ok(cal.checkReached(G));
  assert.ok(G.reached && G.hud.toasts.length === 1);
  assert.ok(!cal.checkReached(G), 'only once');
  G.summerOver = true;
  assert.equal(cal.envelopeText(G).day, 'L’été est fini.');
});

ok('C5 the summer file, when present, puts the weather on the toast', () => {
  cal.setSummer(new Map([['2004-07-01', { date: '2004-07-01', tmaxC: 29.4, humidex: 36, sky: 'fair' }]]));
  assert.equal(cal.weatherLine(5), '29°, humidex 36, beau');
  assert.equal(cal.weatherLine(6), '');
  assert.ok(cal.dayToast(5).startsWith('Jeu 1 juill · 29°'));
  assert.ok(cal.dayToast(70).includes('2 jours avant la fête du Travail'));
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
  const G = cal.startSummer({ difficulty: 'normal' });
  let jobs = 0, gross = 0;
  for (const def of ALL_MISSIONS) {
    const ctx = { carId: 'ranger', carName: 'Ranger', seats: 2, money: 0 };
    for (const st of def.build(ctx)) gross += scaledPay(G, { def }, st.money || 0) - (st.cost || 0);
    jobs++;
  }
  let races = 0;
  for (const c of COURSES) races += scaledPay(G, { def: { mode: c.kind || 'blitz' } }, c.money || 0);
  ok(`P2 one clean pass: ${jobs} jobs net $${gross}, ${COURSES.length} courses $${races} (plan: ~950 and 435)`, () => {
    assert.equal(jobs, 28);
    assert.ok(gross >= 950 && gross <= 1050, `jobs net ${gross}`);
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

ok('E1 both endings are three cards and say the number', () => {
  const yes = endingCards(1240, 1200, true), no = endingCards(910, 1200, false);
  assert.equal(yes.length, 3); assert.equal(no.length, 3);
  assert.ok(yes[0].body.includes('1240 $'));
  assert.ok(yes[1].body.includes('Garde tes piasses'));
  assert.ok(no[0].body.includes('910 $ sur 1200'));
  assert.ok(no[1].body.includes('La 40'));
  for (const c of [...yes, ...no]) assert.ok(c.title && c.body.length > 40);
});

console.log(failed ? `${failed} FAILED` : 'all green');
process.exit(failed ? 1 : 0);
