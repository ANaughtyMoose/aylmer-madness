#!/usr/bin/env node
// Failing is a joke, retry is free (refine plan A-03):  node tools/smoke_retry.mjs
//
//   1. fails.json: a pool for every reason, every line distinct, narrator lines
//      Quebec French, cast lines English and from the main cast, no em dashes
//   2. the plan's five reasons (tow, too late, police, clock, rival) classify
//      apart and each gets its own gag line
//   3. every fail text the jobs write (source scan, and every built stage's
//      failWhy) lands on a real reason, never 'other'
//   4. the flow: fail, R inside the window, the stage comes back on the same
//      frame, the calendar day has not moved and the earlier pay is back
//   5. a second fail costs the day; a window that runs out settles the day;
//      a new job started over the window settles it too; quits get no offer
//      (all on a paid job: B-07 took the day cost off the story)
//   6. B-07 fair pay and fair fails: the escape pay table (1, 2, 3 stars is
//      20, 60, 180 $, through the Wallet), a fail on each of the 10 main
//      missions keeps the day, a racecivic fail still spends it, and
//      clearFailToast() empties the fail card state
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), clear: () => mem.clear(),
};

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${name}${extra ? '   ' + extra : ''}`); }
  else { fail++; console.log(`  FAIL ${name}${extra ? '   ' + extra : ''}`); }
};
const group = (n) => console.log('\n' + n);

const root = fileURLToPath(new URL('..', import.meta.url));
const R = await import('../src/game/retry.js');
const P = await import('../src/game/cops.js');
const { Wallet } = await import('../src/game/money.js');
const { MAIN, FINALE } = await import('../src/game/campaign.js');
const C = await import('../src/game/calendar.js');
const K = await import('../src/game/missionkit.js');
const { ALL_MISSIONS } = await import('../src/game/missions.js');

const json = JSON.parse(readFileSync(join(root, 'assets/text/fails.json'), 'utf8'));
R.setFails(json);

// The same simple classifier smoke_canon.mjs uses (docs/STORY-REBUILD.md).
const words = (list) => new RegExp(`(?<![\\p{L}’])(?:${list})(?![\\p{L}’])`, 'iu');
const EN = words('the|you|your|you’re|i|i’m|it’s|it|is|are|was|and|my|what|don’t|that’s|that|this|with|for|of|to|in|on|at|he|she|we|they|did|do|not|no|just|so|ok|okay|next|time|one|less|or|be|never|going|every|tell|me|so|new|run|get|out|only|goes|probably|both|says');
const FR = words('le|la|les|un|une|des|du|de|pis|pas|je|tu|il|y|c’est|ça|que|qui|est|mon|ma|ton|ta|son|sa|au|aux|dans|pour|avec|va|là|sur|toi|même|rien|t’arrives|t’a|s’est|sauf|recommence|gratis|personne|faut|perdu|sentait|deuxième|pogné');
const lang = (t) => {
  const s = String(t).replace(/[«»]/g, ' ').replace(/'/g, '’');
  const en = EN.test(s), fr = FR.test(s);
  return en && !fr ? 'en' : fr ? 'fr' : 'unknown';
};
const CAST = new Set(['Tom', 'Sayyad', 'Adam', 'Mike', 'Zahra', 'Russell', 'Abraham', 'Robin', 'Margaret']);

group('fails.json and the language rule');
const all = [];
for (const key of R.REASONS) {
  const pool = json.reasons[key];
  ok(Array.isArray(pool) && pool.length >= 2, `${key}: a pool of at least two lines`, pool ? String(pool.length) : 'missing');
  for (const g of pool || []) {
    const text = g.who ? g.en : g.fr;
    all.push(text);
    if (g.who) {
      ok(CAST.has(g.who), `${key}: « ${g.who} » is main cast, so may speak English`);
      ok(lang(g.en) === 'en', `${key}: cast line is English`, g.en);
      ok(!g.fr, `${key}: a cast line carries no French copy`);
    } else {
      ok(lang(g.fr) === 'fr', `${key}: narrator line is French`, g.fr);
    }
  }
}
ok(new Set(all).size === all.length, 'no line is used for two reasons', `${all.length} lines`);
const raw = readFileSync(join(root, 'assets/text/fails.json'), 'utf8');
ok(!/[\u2014]/.test(raw), 'no em dash anywhere in fails.json');
ok(!/[\u2014]/.test(readFileSync(join(root, 'src/game/retry.js'), 'utf8')), 'no em dash anywhere in retry.js');
for (const k of ['title', 'free', 'paid', 'kept']) ok(lang(json.card[k]) !== 'en', `card.${k} is HUD French`, json.card[k]);

group('the five reasons the plan names');
const FIVE = {
  tow: 'Le char est fini. Remorqué.',
  late: 'Trop tard, mon chum.',
  police: 'Ramassé par la police d’Aylmer.',
  clock: 'Le chrono t’a battu.',
  rival: 'Sara est arrivé avant toi.',
};
const gags = {};
for (const [want, why] of Object.entries(FIVE)) {
  const got = R.classifyFail(why, null);
  ok(got === want, `« ${why} » is ${want}`, got);
  gags[want] = R.gagFor(got, 1);
}
ok(new Set(Object.values(gags)).size === 5, 'five reasons, five different gag lines');
ok(R.classifyFail('Le chrono est à zéro. Le blitz est fini.') === 'clock', 'blitz clockFail is clock');
ok(R.classifyFail('', { stages: [{ kind: 'race' }], idx: 0, timeLeft: 0 }) === 'clock', 'a race stage that timed out is clock');
ok(R.classifyFail('', { stages: [{ kind: 'race' }], idx: 0, timeLeft: 20 }) === 'rival', 'a race stage lost on track is rival');
ok(R.classifyFail('', { stages: [{}], idx: 0, timeLeft: 0 }) === 'late', 'any other stage that timed out is late');
ok(R.classifyFail('Abandonné.') === 'quit' && R.classifyFail('Service quitté.') === 'quit', 'Backspace and the menu are quits');

group('every fail text in the game has a reason');
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } };
walk(join(root, 'src'));
const found = new Set();
const RX = [/failWhy\s*:\s*(['`])((?:(?!\1).)+)\1/g, /fail\s*:\s*(['`])((?:(?!\1).)+)\1/g, /failMission\((['`])((?:(?!\1).)+)\1\)/g,
  /clockFail\s*:\s*(['`])((?:(?!\1).)+)\1/g, /airWhy\s*:\s*(['`])((?:(?!\1).)+)\1/g, /lose\s*:\s*\([^)]*\)\s*=>\s*(['`])((?:(?!\1).)+)\1/g];
for (const f of files) {
  if (/retry\.js$/.test(f)) continue;
  const src = readFileSync(f, 'utf8');
  for (const re of RX) for (const m of src.matchAll(re)) {
    const s = m[2].replace(/\$\{[^}]*\}/g, 'X');
    if (s === 'why' || s.length < 6) continue;
    found.add(s);
  }
}
const other = [...found].filter((s) => R.classifyFail(s) === 'other');
ok(found.size >= 20, 'the scan found the fail texts', String(found.size));
ok(other.length === 0, 'none of them falls through to « other »', other.join(' | '));
const ctx = { carId: 'ranger', carName: 'Ranger', seats: 2, places: 3, money: 50 };
let built = 0; const unsorted = [];
for (const def of ALL_MISSIONS) {
  let stages = [];
  try { stages = def.build(ctx) || []; } catch { stages = []; }
  stages.forEach((st, idx) => {
    if (!st.failWhy) return;
    built++;
    const r = R.classifyFail(st.failWhy, { stages, idx, timeLeft: 0 });
    if (r === 'other' || r === 'quit') unsorted.push(`${def.id}#${idx}: ${st.failWhy}`);
  });
}
ok(built >= 15 && unsorted.length === 0, 'every built stage failWhy has a reason', `${built} stages${unsorted.length ? ': ' + unsorted.join(' | ') : ''}`);
for (const id of ['curfew', 'blitz', 'canot']) ok(ALL_MISSIONS.some((d) => d.id === id), `${id} is in the pack`);

group('the flow: fail, R, same stage, same day');
// A paid job (B-07: a story fail no longer has a day to defer or spend).
const def = ALL_MISSIONS.find((d) => d.id === 'blitz') || ALL_MISSIONS[0];
ok(!R.storyFail({ def }), `${def.id} is a paid job, not the story`);
const stages = def.build(ctx);
const wallet = { value: 40, add(v) { this.value += v; } };
const G = { day: 10, difficulty: 'normal', wallet, veh: { passengers: 1 }, summerOver: false };
let m = { def, stages, idx: Math.min(1, stages.length - 1), elapsed: 70, timeLeft: 0, paid: 12 };
G.mission = m;                                      // failMission runs with the job still on G
const back = K.refundJob(G, m);
ok(back === 12 && wallet.value === 28, 'refundJob clawed the earlier pay back', `${back}, wallet ${wallet.value}`);
const offer = R.offerRetry({ G, mission: m, why: 'Trop tard, mon chum.', refunded: back });
ok(offer && offer.free && offer.deferred && G.retry === offer, 'the first fail offers a free retry with the day deferred');
ok(G.day === 10 && G.dayOwed === 1, 'the day is on the slate, not spent', `day ${G.day}, owed ${G.dayOwed}`);
const card = R.retryCard(offer);
ok(card.startsWith('RATÉ\n') && card.includes(offer.gag) && /\bR : /.test(card) && card.includes('gratis'), 'the card: RATÉ, the gag, R gratis');
ok(!/\u2014/.test(card), 'the card has no em dash');
ok(R.retryPrompt(G) && /45 s/.test(R.retryPrompt(G)), 'the prompt counts the window', R.retryPrompt(G));
// main.js's failMission rule with the offer in hand: no endOfJob when deferred.
if (K.failCostsDay(m) && !offer.deferred) C.spendDay(G, null);
ok(G.day === 10, 'failMission does not spend the day');
G.mission = null;                                   // closeMission('fail')
ok(R.tickRetry(G, 2.0, null, false) === null && G.retry.left === 43, 'two seconds in the window, still on offer');
const pressed = new Set(['KeyR']);
const input = { hit: (c) => pressed.has(c), consume: (c) => pressed.delete(c) };
const t0 = performance.now();
const r = R.tickRetry(G, 1 / 60, input);
ok(r && r.take && r.take.saved.id === def.id && r.take.saved.stage === m.idx, 'R takes the retry at the failed stage', JSON.stringify(r && r.take && r.take.saved));
ok(!pressed.has('KeyR'), 'KeyR was consumed (the radio does not also toggle)');
// resumeMission(saved) as main.js does it: the job rebuilt at that stage.
G.mission = { def, stages: def.build(ctx), idx: r.take.saved.stage, elapsed: r.take.saved.elapsed, timeLeft: null, paid: 0 };
R.applyRetry(G, r.take);
const ms = performance.now() - t0;
ok(ms < 3000, 'the stage is back in under 3 s', `${ms.toFixed(1)} ms, one frame`);
ok(G.day === 10 && !G.dayOwed, 'calendar day unchanged after the first retry', `day ${G.day}`);
ok(wallet.value === 40 && G.mission.paid === 12, 'the earlier pay is back in your pocket', `wallet ${wallet.value}`);
ok(G.mission.retries === 1 && !G.retry, 'the job knows it was retried');

group('second fail, expiry, a new job, quits');
m = G.mission; m.elapsed = 90;
const back2 = K.refundJob(G, m);
const o2 = R.offerRetry({ G, mission: m, why: 'Le char est fini. Remorqué.', refunded: back2 });
ok(o2 && !o2.free && !o2.deferred && o2.reason === 'tow', 'a second fail still offers R, not free');
if (K.failCostsDay(m) && !o2.deferred) C.spendDay(G, null);
ok(Math.floor(G.day) === 11, 'and costs the day the old way', String(G.day));
ok(/journée/.test(R.retryCard(o2)), 'the card says so');
G.mission = null; G.retry = null;

G.mission = m;
const G2 = { day: 5, difficulty: 'normal', veh: {}, summerOver: false };
R.offerRetry({ G: G2, mission: { def, stages, idx: 1, elapsed: 60 }, why: 'Ramassé par la police d’Aylmer.' });
let ex = null;
for (let i = 0; i < 50 && !ex; i++) ex = R.tickRetry(G2, 1, null, false);
ok(ex && ex.expired && ex.dayChanged && G2.day === 6 && !G2.retry, 'a window that runs out settles the deferred day', `day ${G2.day}`);

const G3 = { day: 5, difficulty: 'normal', veh: {}, summerOver: false };
R.offerRetry({ G: G3, mission: { def, stages, idx: 1, elapsed: 60 }, why: 'Le chrono t’a battu.' });
G3.mission = { def, stages, idx: 0 };                // startMission without cancelRetry
const sup = R.tickRetry(G3, 1 / 60, null, true);
ok(sup && sup.superseded && G3.day === 6 && !G3.retry, 'a new job over the window settles the day, and R does nothing', `day ${G3.day}`);
const G4 = { day: 5, difficulty: 'normal', veh: {}, summerOver: false };
R.offerRetry({ G: G4, mission: { def, stages, idx: 1, elapsed: 60 }, why: 'Sara est arrivé avant toi.' });
ok(R.cancelRetry(G4) && G4.day === 6, 'cancelRetry settles the day too');
const G5 = { day: 5, difficulty: 'normal', veh: {}, summerOver: false };
ok(R.offerRetry({ G: G5, mission: { def, stages, idx: 1, elapsed: 60 }, why: 'Abandonné.' }) === null && G5.day === 5 && !G5.dayOwed, 'a quit gets no offer and defers nothing');
const G6 = { day: 5, difficulty: 'normal', veh: {}, summerOver: false };
const early = R.offerRetry({ G: G6, mission: { def, stages, idx: 0, elapsed: 10 }, why: 'Trop tard.' });
ok(early && early.free && !early.deferred && !G6.dayOwed, 'an early fail costs no day, so nothing is deferred');

group('calendar: owed days');
const G7 = { day: 3, difficulty: 'normal', summerOver: false };
C.deferDay(G7);
C.spendDay(G7, null);
ok(G7.day === 5 && !G7.dayOwed, 'spendDay pays an owed day along with its own', String(G7.day));
C.deferDay(G7); ok(C.forgiveDay(G7) && !G7.dayOwed && G7.day === 5, 'forgiveDay drops it');
ok(!C.settleDay(G7, null) && G7.day === 5, 'settleDay with nothing owed is a no-op');
ok(K.restartCostsDay({ idx: 1, elapsed: 5 }) && !K.restartCostsDay({ idx: 0, elapsed: 10 }), 'restartCostsDay is unchanged');

group('B-07: the escape pays by stars');
{
  const want = { 1: 20, 2: 60, 3: 180 };
  for (const n of [1, 2, 3]) ok(P.escapePay(n) === want[n], `escapePay(${n}) is ${want[n]} $`, String(P.escapePay(n)));
  ok(P.escapePay(0) === 0 && P.escapePay(5) === 180, 'no chase pays nothing; the meter stops at three');
  ok(P.escapePay(3) > P.TICKET, 'three stars beats the 150 $ ticket', `${P.escapePay(3)} > ${P.TICKET}`);
  // The real path: Cops.update with nobody in sight bleeds the heat to zero,
  // and the escape pays the peak the chase reached into a real Wallet.
  for (const n of [1, 2, 3]) {
    const toasts = [];
    const wallet = new Wallet(null); wallet.set(100);
    const G = {
      veh: { x: 0, z: 0, speedKmh: 40, spec: {} }, wallet, mission: null, traffic: null, stats: null,
      hud: { toast: (t) => toasts.push(t), prompt() {}, setStars() {} },
      audio: { siren() {}, honk() {}, crash() {}, chime() {} }, ranRed: false,
    };
    const C = new P.Cops();
    C.chasing = true; C.peak = n; C.heat = 0.5;      // the units have already gone (nothing within 300 m)
    let t = 0;
    while (C.heat > 0 && t < 60) { C.update(1 / 60, G); t += 1 / 60; }
    ok(wallet.value === 100 + want[n] && C.lastEscape && C.lastEscape.pay === want[n],
      `${n} star${n > 1 ? 's' : ''}: the escape pays ${want[n]} $ through the Wallet`, `${wallet.value} $ after ${t.toFixed(1)} s`);
    ok(toasts.some((s) => /semés/.test(s) && s.includes(`+${want[n]} $`)), `${n}: the toast says « Tu les as semés » and the pay`);
    ok(C.peak === 0 && !C.chasing, `${n}: the chase is over, the peak is reset`);
  }
  const wallet = new Wallet(null); wallet.set(100);
  const G = { wallet, mission: { stages: [{ kind: 'escape' }], idx: 0 }, hud: null };
  const C = new P.Cops(); C.peak = 3; C.chasing = true;
  C.escaped(G);
  ok(wallet.value === 100 && C.lastEscape.pay === 0, 'a scripted escape stage pays through its job, not twice');
  const C2 = new P.Cops(); C2.peak = 3; C2.clear();
  ok(C2.peak === 0, 'a bust or a clear() drops the peak, so a ticket never pays');
  // The peak follows the stars the meter shows (update reads floor(heat)).
  const C3 = new P.Cops(); C3.heat = 2.4;
  // A race holds the spawns (no nav in this suite); the meter still reads.
  const G3 = { veh: { x: 0, z: 0, speedKmh: 40, spec: {} }, mission: { def: { race: true } }, hud: null, traffic: null, ranRed: false, audio: null };
  C3.update(1 / 60, G3);
  ok(C3.peak === 2, 'update records the peak stars of the chase', String(C3.peak));
}

group('B-07: a story fail keeps the day; paid jobs and races do not');
{
  const steps = MAIN.map((s) => s.ids);
  ok(steps.length === 10, 'campaign.js has the ten main missions');
  let checked = 0;
  const failOnce = (id, opts = {}) => {
    const d = ALL_MISSIONS.find((x) => x.id === id);
    if (!d) return null;
    let st = []; try { st = d.build(ctx) || []; } catch { st = [{}]; }
    const G = { day: 20, difficulty: 'normal', wallet: new Wallet(null), veh: { passengers: 0 }, summerOver: false };
    const mm = { def: d, stages: st, idx: Math.min(1, st.length - 1), elapsed: 120, timeLeft: 0, paid: 0, retries: opts.retries || 0 };
    G.mission = mm;
    // main.js failMission, verbatim in order: refund, offer, endOfJob when it costs a day, close.
    const back = K.refundJob(G, mm);
    const o = R.offerRetry({ G, mission: mm, why: opts.why || 'Trop tard, mon chum.', refunded: back });
    if (K.failCostsDay(mm) && !(o && o.deferred)) C.spendDay(G, null);
    G.mission = null;
    const day1 = G.day;
    // and the window runs out with nothing taken
    for (let i = 0; i < 60 && G.retry; i++) R.tickRetry(G, 1, null, false);
    return { G, o, day1, mm };
  };
  for (const ids of steps) {
    for (const id of ids) {
      const a = failOnce(id);
      if (!a) { ok(true, `${id}: not in this build, skipped`); continue; }
      checked++;
      ok(K.failCostsDay(a.mm), `${id}: the fail is late enough that it used to cost a day`);
      ok(a.day1 === 20 && a.G.day === 20 && !a.G.dayOwed && !a.G.dayKept, `${id}: day unchanged after a fail and the window`, `day ${a.G.day}`);
      ok(a.o && !a.o.deferred && a.o.story, `${id}: nothing deferred, the offer knows it is the story`);
      const b = failOnce(id, { retries: 1, why: 'Le char est fini. Remorqué.' });
      ok(b.G.day === 20 && !/journée\./.test(R.retryCard(b.o).replace('La journée reste.', '')),
        `${id}: a second fail keeps the day too, and the card does not say it costs one`, `day ${b.G.day}`);
      const q = failOnce(id, { why: 'Abandonné.' });
      ok(q.o === null && q.G.day === 20, `${id}: a quit (Backspace) keeps the day`);
    }
  }
  ok(checked >= 10, 'every main mission in the build was failed', `${checked} ids`);
  const f = failOnce(FINALE);
  ok(!f || f.G.day === 20, 'the finale keeps the day too');
  // Paid jobs and races keep the day cost.
  const rc = failOnce('racecivic', { retries: 1, why: 'Sara est arrivé avant toi.' });
  ok(rc && Math.floor(rc.G.day) === 21, 'racecivic: a second fail still spends the day', rc ? String(rc.G.day) : 'missing');
  const rc1 = failOnce('racecivic', { why: 'Sara est arrivé avant toi.' });
  ok(rc1 && rc1.o.deferred && Math.floor(rc1.G.day) === 21, 'racecivic: a first fail defers it, and the window running out spends it', rc1 ? String(rc1.G.day) : 'missing');
  ok(!R.failSpendsDay({ def: { id: 'alternateur' }, idx: 1 }) && R.failSpendsDay({ def: { id: 'racecivic' }, idx: 1 }),
    'failSpendsDay: never for the story, the old rule for the rest');
  // A day mark nobody consumed never eats a later, honest day.
  const G = { day: 30, difficulty: 'normal', summerOver: false, mission: { def: { id: 'dep' } } };
  C.keepDay(G, 'sayyad');
  ok(C.spendDay(G, null) && G.day === 31 && !G.dayKept, 'a stale keep mark does not stop another job spending its day');
  C.keepDay(G, 'sayyad'); R.cancelRetry(G);
  ok(!G.dayKept, 'cancelRetry (every startMission) drops a stale keep mark');
}

group('B-07: the fail toast lives in retry.js');
{
  const d = ALL_MISSIONS.find((x) => x.id === 'golfcart') || def;
  const G = { day: 10, difficulty: 'normal', veh: {}, summerOver: false };
  const mm = { def: d, stages: d.build(ctx), idx: 1, elapsed: 80 };
  G.mission = mm;
  const o = R.offerRetry({ G, mission: mm, why: 'Trop tard, mon chum.' });
  const ft = R.failToast();
  ok(ft && ft.text === R.retryCard(o) && ft.id === d.id && ft.left > 0, 'offerRetry puts the fail card in the state', ft ? ft.id : 'none');
  ok(R.clearFailToast() && R.failToast() === null, 'clearFailToast() empties the state');
  ok(!R.clearFailToast(), 'and a second clear has nothing to drop');
  R.offerRetry({ G, mission: mm, why: 'Trop tard, mon chum.' });
  G.mission = null;
  R.cancelRetry(G);                                  // startMission of the next job
  ok(R.failToast() === null, 'a new job (cancelRetry) takes the last fail line with it');
  R.offerRetry({ G, mission: mm, why: 'Trop tard, mon chum.' });
  G.mission = null;
  R.tickRetry(G, R.RETRY_CARD_MS / 1000 + 0.1, null, false);
  ok(R.failToast() === null && G.retry, 'the card times out on its own while R is still on offer');
  R.cancelRetry(G);
  R.setFailToast('RATÉ\nAbandonné.', 3000, 'dep');
  ok(R.failToast() && R.failToast().ms === 3000, 'setFailToast for a fail with no offer');
  R.clearFailToast();
  ok(!/[\u2013\u2014]/.test(readFileSync(join(root, 'src/game/cops.js'), 'utf8').split('ESCAPE_PAY')[1].slice(0, 2000)), 'no dash in the new cops.js text');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
