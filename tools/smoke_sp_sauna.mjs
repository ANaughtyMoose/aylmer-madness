// « Le sauna de cèdre » (mission 7, id stvincent):  node tools/smoke_sp_sauna.mjs
//
// Tom's mission 7 (D31, 13 Oct 2026), rebuilt by S4-SAUNA (20 Oct):
//   1. the water balance as pure functions: drain, soak, cooldown, shorts, spills
//   2. too little, just right, too much: what each does, and that attention pays
//   3. the screen ramps (cook and steam) and the meter labels
//   4. the six stages with a fake G: plank, leg 1, the cut (real Nav), leg 2,
//      the lot card, the meal, the samosas; Sayyad in English
//   5. the two joke fails (bone dry, the third short) and the R retry reason
//   6. cleanup on abort from every stage leaves nothing behind
import { MAP } from '../src/game/mapdata.js';
import { PLACES, resolvePlaces } from '../src/game/places.js';
import { Nav } from '../src/game/nav.js';
import { LIFE_MISSIONS } from '../src/game/lifejobs.js';
import { stageEnter, stageStep, stageExit, stageTarget, missionCleanup } from '../src/game/missionkit.js';
import { classifyFail } from '../src/game/retry.js';
import * as H from '../src/game/setpieces/sauna_heat.js';
import * as SP from '../src/game/setpieces/sauna.js';

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  - ' + extra : '')); }
};
const group = (n) => console.log('\n' + n);
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
const DT = 1 / 60;

// Simulate a policy over a drive profile: [[seconds, kmh, traffic], ...].
function drive(profile, policy) {
  const s = H.newSauna();
  let t = 0, lastPour = -99;
  for (const [secs, kmh, traffic] of profile) {
    for (let i = 0; i < Math.round(secs / DT); i++) {
      if (policy(s, t, lastPour) && H.pour(s)) lastPour = t;
      H.saunaStep(s, DT, { speedKmh: kmh, traffic });
      s.events.length = 0;
      t += DT;
    }
  }
  return H.saunaResult(s);
}
const PROFILE = [[60, 50, 0], [30, 0, 3], [110, 35, 1]];
const BOT = (s) => s.w + s.pend < H.BOT_POUR_BELOW;
const LAZY = (s, t, last) => t - last >= 8;
const MASH = () => true;
const NONE = () => false;

group('the balance: pure functions');
{
  const s = H.newSauna();
  ok(s.w === 0.55 && H.zoneOf(s.w) === 'ok' && s.shorts === 0, 'starts in the green: Sayyad’s first splash at the fence');
  ok(near(H.drainRate(60, 0), 0.020) && near(H.drainRate(5, 0), 0.040) && near(H.drainRate(27.5, 0), 0.030) && near(H.drainRate(60, 99), 0.035),
    'dries slowly at speed, fast stopped, faster in traffic (capped at 3 cars)');
  ok(H.pour(s), 'F pours');
  for (let i = 0; i < 30; i++) H.saunaStep(s, DT, { speedKmh: 60 });
  ok(near(s.w, 0.55 + 0.15 - 0.020 * 0.5, 1e-6) && s.pend < 1e-9, `a splash soaks in over half a second (w ${s.w.toFixed(4)})`);
  const c = H.newSauna();
  H.pour(c);
  for (let i = 0; i < 12; i++) H.saunaStep(c, DT, { speedKmh: 60 });
  ok(!H.pour(c), 'no second splash 0.2 s after the first');
  for (let i = 0; i < 10; i++) H.saunaStep(c, DT, { speedKmh: 60 });
  ok(H.pour(c), 'a second splash 0.36 s after');
  ok(H.POUR_KEY === 'KeyF', 'F is the water key');
}

group('too much: the dash shorts out');
{
  const s = H.newSauna();
  let t = 0, at = null;
  for (let i = 0; i < 200 && at == null; i++) {
    if ([0, 24, 48, 72].includes(i)) H.pour(s);
    H.saunaStep(s, DT, { speedKmh: 0 });
    t += DT;
    if (s.events.includes('short')) at = t;
    s.events.length = 0;
  }
  ok(at != null && at > 1.45 && at < 1.7, `four splashes in a row short it at ${at && at.toFixed(2)} s`);
  ok(s.shorts === 1 && near(s.w, H.SHORT_RESET_W) && s.pend === 0 && s.immune > 0, 'after a short: windows open, w back in the green, a few seconds of grace');
  let t2 = 0, second = null;
  for (let i = 0; i < 6 / DT; i++) {
    H.pour(s);
    H.saunaStep(s, DT, { speedKmh: 0 });
    t2 += DT;
    if (s.events.includes('short') && second == null) second = t2;
    s.events.length = 0;
  }
  ok(second != null && second >= H.SHORT_IMMUNE && second <= 6, `mashing: no second short inside ${H.SHORT_IMMUNE} s, one by 6 s (${second && second.toFixed(2)} s)`);
  const fog = H.newSauna(); fog.w = 0.8; H.saunaStep(fog, DT, { speedKmh: 60 });
  ok(fog.zone === 'fog' && fog.events.includes('enter:fog'), 'over the band is « TROP DE VAPEUR »');
}

group('too little: the cab cooks, then the truck goes sluggish');
{
  const s = H.newSauna();
  let t = 0, cookAt = null, zeroAt = null, pinAt = null;
  for (let i = 0; i < 40 / DT; i++) {
    H.saunaStep(s, DT, { speedKmh: 60 });
    t += DT;
    if (cookAt == null && s.zone === 'cook') cookAt = t;
    if (zeroAt == null && s.w === 0) zeroAt = t;
    if (pinAt == null && s.events.includes('pinned')) pinAt = t;
    s.events.length = 0;
  }
  ok(near(cookAt, 7.5, 0.05), `no water at cruise: « ÇA CUIT » at ${cookAt && cookAt.toFixed(2)} s`);
  ok(near(zeroAt, 27.5, 0.05), `bone dry at ${zeroAt && zeroAt.toFixed(2)} s`);
  ok(near(pinAt, 27.5 + H.PINNED_S, 0.05), `sluggish at ${pinAt && pinAt.toFixed(2)} s`);
  H.pour(s);
  for (let i = 0; i < 2; i++) H.saunaStep(s, DT, { speedKmh: 60 });
  ok(!s.pinned && s.zeroT === 0, 'one splash ends it');
}

group('just right: a knock spills, attention pays, ignoring or mashing does not');
{
  const s = H.newSauna(); s.w = 0.5;
  H.saunaStep(s, DT, { speedKmh: 60, impact: 0.4 });
  ok(s.spills === 1 && near(s.w, 0.5 + H.SPILL - 0.020 * DT), 'a knock sloshes the jug on the dash');
  for (let i = 0; i < 59; i++) H.saunaStep(s, DT, { speedKmh: 60 });
  H.saunaStep(s, DT, { speedKmh: 60, impact: 1 });
  ok(s.spills === 1, 'at most one spill per 1.5 s');
  for (let i = 0; i < 36; i++) H.saunaStep(s, DT, { speedKmh: 60 });
  H.saunaStep(s, DT, { speedKmh: 60, impact: 0.4 });
  ok(s.spills === 2, 'and another after the gap');
  const soft = H.newSauna(); H.saunaStep(soft, DT, { speedKmh: 60, impact: 0.34 });
  ok(soft.spills === 0, 'a bump does not spill');

  const bot = drive(PROFILE, BOT), lazy = drive(PROFILE, LAZY), mash = drive(PROFILE, MASH), none = drive(PROFILE, NONE);
  ok(bot.inBand >= 0.85 && bot.shorts === 0, `one splash at the bottom of the green: ${Math.round(bot.inBand * 100)} % green, ${bot.shorts} shorts, ${bot.pours} splashes in 200 s`);
  ok(lazy.inBand >= 0.20 && lazy.inBand <= 0.65, `a splash every 8 s whatever the meter says: ${Math.round(lazy.inBand * 100)} %`);
  ok(mash.shorts >= 5, `mashing F: ${mash.shorts} shorts`);
  ok(none.inBand <= 0.10, `no water at all: ${Math.round(none.inBand * 100)} %`);
  ok(H.saunaBonus({ inBand: 0.85, shorts: 0 }) === 20 && H.saunaBonus({ inBand: 0.60, shorts: 0 }) === 9
    && H.saunaBonus({ inBand: 0.39, shorts: 0 }) === 0 && H.saunaBonus({ inBand: 0.85, shorts: 2 }) === 10, 'the sauna bonus: 0 to 20 $, 5 $ off per short');
  const grades = [
    H.saunaGrade({ inBand: 0.9, shorts: 0 }), H.saunaGrade({ inBand: 0.7, shorts: 1 }), H.saunaGrade({ inBand: 0.5, shorts: 0 }),
    H.saunaGrade({ inBand: 0.2, shorts: 3, fogS: 50, cookS: 10 }), H.saunaGrade({ inBand: 0.2, shorts: 0, fogS: 0, cookS: 80 }),
  ];
  ok(grades.join('|') === 'Sauna parfait|Bon sauna|Sauna tiède|Lave-auto|Four à pizza', grades.join(' | '));
}

group('screen: the cook and the steam ramps, the meter');
{
  const lo = H.fxLook(0), mid = H.fxLook(0.6), hi = H.fxLook(1), pin = H.fxLook(1, true);
  ok(lo.blur === 0 && lo.tint === 0 && lo.wobble === 0, 'in the green the screen is clean');
  ok(mid.blur > 0 && hi.blur > mid.blur && pin.blur > hi.blur && hi.tint > mid.tint && hi.shimmer > mid.shimmer, 'blur, tint and shimmer climb as it cooks');
  ok(H.cookOf(0.55) === 0 && H.fogOf(0.55) === 0 && H.fogLook(0).fog === 0 && H.fogLook(1).fog === 0.55, 'in the band: no cook, no steam');
  ok(H.cookOf(0) === 1 && near(H.fogOf(H.SHORT_AT), 1), 'bone dry is full cook, the short is full steam');
  ok(H.ZONE_LABEL.cook.text === 'ÇA CUIT' && H.ZONE_LABEL.ok.text === 'PARFAIT' && H.ZONE_LABEL.fog.text === 'TROP DE VAPEUR', 'the meter says it in words, not colour alone');
  const fx = H.openSaunaFx();
  ok(fx && !fx.dom, 'the DOM effect is a no-op in Node');
  fx.update(H.newSauna()); fx.puff(); fx.short(); fx.fade(1); fx.close();
  const off = H.listenPour(() => {});
  ok(typeof off === 'function', 'the F listener is a no-op in Node');
  off();
}

group('the mission, stage by stage');
const mem = new Map();
globalThis.localStorage = globalThis.localStorage || { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const nearestRoad = (x, z) => {
  let bd = Infinity, best = { x, z, yaw: 0, name: '', dist: Infinity };
  for (const r of MAP.roads) {
    if (r.cls === 'service') continue;
    for (let i = 0; i + 1 < r.pts.length; i++) {
      const [ax, az] = r.pts[i], [bx, bz] = r.pts[i + 1];
      const ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1e-6;
      const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
      const px = ax + ex * t, pz = az + ez * t, d = Math.hypot(px - x, pz - z);
      if (d < bd) { bd = d; best = { x: px, z: pz, yaw: Math.atan2(ex, ez), name: r.name || '', dist: d }; }
    }
  }
  return best;
};
resolvePlaces({ nearestRoad });
const nav = new Nav();
const pathLen = (p) => { let s = 0; for (let i = 1; i < (p || []).length; i++) s += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return s; };
const HOSP = PLACES.stvincent;

const def = LIFE_MISSIONS.find((d) => d.id === 'stvincent');
ok(!!def && def.title === 'Le sauna de cèdre' && def.giver === 'sayyad', 'stvincent is « Le sauna de cèdre », offered at Sayyad’s');
const stages = def.build({ carName: 'Ranger' });
ok(stages.map((s) => s.kind).join() === 'plank,heat,heat,enter,meal,samosas', stages.map((s) => s.kind).join());
ok(stages.every((s) => /\b(E|F|GPS|WASD|Espace)\b/.test(s.sub)), 'every sub names a key');
ok(stages.every((s) => s.hint), 'every stage has a hint');
ok(!stages.some((s) => s.time), 'no clock anywhere');
ok(stages.find((s) => s.kind === 'meal').money === 40, 'the shift pays 40 $');

// Text rules over everything the mission says.
{
  const lines = Object.values(SP.SAUNA_LINES).flat();
  const texts = [def.title, def.brief, SP.FAIL_COOK, SP.FAIL_DROWN, ...stages.flatMap((s) => [s.text, s.sub, s.hint, s.toast, s.holdText, s.failWhy]), ...lines.map((l) => l[1])].filter(Boolean);
  ok(!texts.some((t) => /[–—]/.test(t)), 'no em dash, no en dash');
  ok(!texts.some((t) => /\b\d{2,4}\s+(Denise|Frank|Fraser)/.test(t)), 'no friend’s house number in the public build');
  ok(!texts.some((t) => /Sayyad: «/.test(t)), 'Sayyad never speaks through a narrator toast');
  ok(!texts.some((t) => /boyau|radiateur|surchauffe|Lafleur|Norm\b|asleep|dans le truck/i.test(t)), 'nothing of the cut bridge beat, nobody waiting in the truck');
  ok(lines.every(([who, t]) => who === 'Sayyad' && t.replace(/[«»]/g, '').trim().split(/\s+/).length <= 12), 'Sayyad’s lines are his, 12 words at most');
  ok(lines.every(([, t]) => !/\b(le|la|les|pis|une|je|tu|est)\b/i.test(t)), 'Sayyad speaks English');
  ok(lines.some(([, t]) => /\bOK OK OK\b/.test(t)) && lines.some(([, t]) => /Apple/.test(t)), 'his tic and his Macs');
  ok(lines.some(([, t]) => /NASA/.test(t)) && texts.some((t) => /Somerset, chez NASA/.test(t)), 'he walks to NASA on Somerset, and comes back');
}

const toasts = [], said = [];
let fakeRadio;
function freshG() {
  fakeRadio = { on: true, suspended: false, suspend() { this.suspended = true; this.on = false; }, resume() { this.suspended = false; this.on = true; } };
  return {
    veh: {
      x: 0, z: 0, yaw: 0, speedKmh: 0, vLong: 0, passengers: 0, impact: 0,
      reset(x, z, yaw) { this.x = x; this.z = z; this.yaw = yaw; this.vLong = 0; this.speedKmh = 0; },
    },
    hud: { prompt(t) { G.lastPrompt = t; }, toast(t) { toasts.push(t); } },
    heckle: { line(who, t) { said.push([who, t]); }, cancel() {} },
    radio: fakeRadio,
    wantStart: false, traffic: { cars: [] }, nav, wallet: { value: 0, add(n) { this.value += n; } },
  };
}
let G = freshG();
const m = { def, stages, idx: 0, target: null, paid: 0 };
const put = (key) => { const p = PLACES[key]; G.veh.x = p.x; G.veh.z = p.z; };
// One main.js tick, minus the physics: stageStep, then wantStart is cleared.
function tick(dt = DT) {
  const st = stages[m.idx];
  m.target = stageTarget(G, m, st);
  const res = stageStep(G, m, st, dt);
  G.wantStart = false;
  if (res === 'done') {
    if (st.toast) toasts.push(st.toast);
    if (st.money) G.wallet.add(st.money);
    stageExit(G, m, st); m.idx++; if (stages[m.idx]) stageEnter(G, m, stages[m.idx]);
  }
  return res;
}
stageEnter(G, m, stages[0]);

// 0. The plank.
put('sayyad');
tick();
ok(m.idx === 0, 'the plank needs E');
G.wantStart = true; tick();
ok(m.idx === 1 && toasts.some((t) => /cèdre est sur le dash/.test(t)), 'E at Sayyad’s: the cedar is on the dash');
ok(said.some(([w, t]) => w === 'Sayyad' && /one plank/.test(t)), 'Sayyad on the plank, in English');
ok(!!G.sauna && !!m.sauna && m.sauna.w === 0.55, 'the toy starts in the green');

// 1. Leg 1 with the bot policy (one splash at the bottom of the green) until the cut.
{
  const path = nav.route(G.veh.x, G.veh.z, HOSP.x, HOSP.z);
  let acc = 0, cutAt = null;
  for (let i = 1; i < path.length; i++) {
    acc += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    if (Math.hypot(path[i][0] - HOSP.x, path[i][1] - HOSP.z) <= SP.CUT_CROW_M) { cutAt = acc; break; }
  }
  ok(cutAt > 1150 && cutAt < 1400, `leg 1 is ${Math.round(cutAt)} m of route from Sayyad’s to the cut`);
  // Out on Chemin d'Aylmer, short of the cut: no cut.
  const far = { x: HOSP.x - (SP.CUT_CROW_M + 50), z: HOSP.z };
  G.veh.x = far.x; G.veh.z = far.z; G.veh.speedKmh = 55;
  for (let i = 0; i < 60 * 30; i++) { if (m.sauna.w + m.sauna.pend < H.BOT_POUR_BELOW) m.sauna.wantPour = true; tick(); }
  ok(m.idx === 1 && m.sauna.shorts === 0 && m.sauna.zone !== 'cook', `30 s of driving with the bot rule: ${m.sauna.pours} splashes, ${(m.sauna.w * 100).toFixed(0)} % wet`);
  // Police on you at the cut point: no free escape.
  G.veh.x = HOSP.x - (SP.CUT_CROW_M - 10); G.cops = { heat: 1 };
  for (let i = 0; i < 60; i++) tick();
  ok(m.idx === 1 && G.lastPrompt === 'Sème la police avant', 'with police stars the cut waits: « Sème la police avant »');
  G.cops = { heat: 0 };
  let n = 0;
  while (m.idx === 1 && n < 60) { tick(); n++; }
  ok(m.idx === 2 && near(n / 60, 0.5, 2 / 60), `inside the cut distance: half a second of black, then the cut (${n} ticks)`);
  ok(toasts.includes('Ottawa. Vingt minutes plus tard.'), 'the narrator skips the drive: « Ottawa. Vingt minutes plus tard. »');
  ok(nav.streetName(G.veh.x, G.veh.z) === 'Booth Street', `the truck comes back on ${nav.streetName(G.veh.x, G.veh.z)}`);
  const leg2 = pathLen(nav.route(G.veh.x, G.veh.z, HOSP.x, HOSP.z));
  ok(leg2 > 800 && leg2 < 1100, `leg 2 is ${Math.round(leg2)} m of fresh route to the hospital`);
  ok(m.sauna.w >= 0.30 && m.sauna.w <= 0.80 && !!G.sceneCut && G.sceneCut.id === 'stvincent', 'fair state after the cut, and the harness is told it was a scene cut');
}

// 2. Leg 2: too much water downtown (one short, the show), then park.
{
  G.veh.speedKmh = 20;
  const before = said.length;
  for (let i = 0; i < 60 * 2.5; i++) { m.sauna.wantPour = true; tick(); }
  ok(m.sauna.shorts === 1, `mashing F downtown: ${m.sauna.shorts} short`);
  ok(fakeRadio.suspended, 'the radio dies with the short');
  ok(said.slice(before).some(([w, t]) => w === 'Sayyad' && /radio/.test(t)), 'Sayyad: « OK OK OK. Was that the radio? »');
  ok(toasts.some((t) => /étincelles partout/.test(t)), 'the narrator: sparks everywhere');
  ok(m.idx === 2, 'one short is a laugh, not a fail');
  for (let i = 0; i < 60 * 7; i++) { if (m.sauna.w + m.sauna.pend < H.BOT_POUR_BELOW) m.sauna.wantPour = true; tick(); }
  ok(!fakeRadio.suspended, 'the radio comes back on its own');
  put('stvincent'); G.veh.speedKmh = 10;
  const res = H.saunaResult(m.sauna), bonus = H.saunaBonus(res);
  const w0 = G.wallet.value;
  tick();
  ok(m.idx === 3, 'the hospital lot ends the drive');
  ok(G.wallet.value - w0 === bonus && toasts.some((t) => /dans le vert · 1 court-circuit · sauna \+\d+ \$/.test(t)), `the grade card on arrival, sauna bonus ${bonus} $`);
}

// 3. The lot: Sayyad leaves for NASA.
ok(G.sauna === null, 'the toy is gone in the lot');
ok(!fakeRadio.suspended, 'and the radio is not left off');
ok(said.some(([, t]) => /walking to NASA/.test(t)), 'Sayyad: walking to NASA');
G.veh.speedKmh = 0;
tick();
ok(m.idx === 3, 'going in needs E');
G.wantStart = true; tick();
ok(m.idx === 4 && !!G.mealShift && toasts.some((t) => /rue Somerset, chez NASA/.test(t)), 'E goes in; Sayyad walks to Somerset; the meal opens');

// 4. The meal, as before.
tick();
ok(m.idx === 4, 'the shift runs until the last bite');
G.mealShift.state.served = [3, 3, 3];
tick();
ok(m.idx === 5 && G.mealShift === null, 'nine bites finish the shift and close it');

// 5. The samosas.
ok(toasts.some((t) => /revenu de chez NASA/.test(t)) && said.some(([, t]) => /cedar’s still dripping/.test(t)), 'Sayyad is back from NASA with the bag');
tick();
ok(m.idx === 5, 'the samosa needs E');
G.wantStart = true; tick();
ok(m.idx === 6 && toasts.some((t) => /samosas chauds/.test(t)), 'E: a samosa, the job is done');
missionCleanup(G, m, false);
ok(G.sauna == null && G.mealShift == null, 'nothing left behind at the end');

group('the joke fails, and R');
function legRun(policy, secs, kmh) {
  const Gx = freshG();
  const mx = { def, stages: def.build({}), idx: 1, target: null };
  Gx.veh.x = HOSP.x - 10500; Gx.veh.z = HOSP.z; Gx.veh.speedKmh = kmh;
  G = Gx;
  stageEnter(Gx, mx, mx.stages[1]);
  let r = null, t = 0;
  for (let i = 0; i < secs / DT && !(r && r.fail); i++) {
    if (policy(mx.sauna)) mx.sauna.wantPour = true;
    mx.target = stageTarget(Gx, mx, mx.stages[1]);
    r = stageStep(Gx, mx, mx.stages[1], DT);
    t += DT;
  }
  return { r, t, G: Gx, m: mx };
}
{
  const dry = legRun(() => false, 80, 60);
  ok(dry.r && dry.r.fail === SP.FAIL_COOK, `no water at all: « ${dry.r && dry.r.fail} »`);
  ok(near(dry.t, 27.5 + H.COOK_FAIL_S, 0.1), `after ${dry.t.toFixed(1)} s: 27.5 s to bone dry, ${H.COOK_FAIL_S} s of « F! Sayyad cuit! » warning`);
  ok(classifyFail(dry.r.fail) === 'heat', 'the card gets the sauna gag');
  missionCleanup(dry.G, dry.m, true);
  ok(dry.G.sauna === null, 'cleanup after the fail');

  const wet = legRun(() => true, 30, 40);
  ok(wet.r && wet.r.fail === SP.FAIL_DROWN, `mashing F: « ${wet.r && wet.r.fail} »`);
  ok(wet.m.sauna.shorts === H.SHORT_FAIL && wet.t < 14, `${wet.m.sauna.shorts} shorts in ${wet.t.toFixed(1)} s`);
  ok(classifyFail(wet.r.fail) === 'heat', 'the drowned dash gets the sauna gag too');
  missionCleanup(wet.G, wet.m, true);
  ok(wet.G.sauna === null && !wet.G.radio.suspended, 'cleanup gives the radio back');

  const calm = legRun((s) => s.w + s.pend < H.BOT_POUR_BELOW, 120, 30);
  ok(!(calm.r && calm.r.fail) && calm.m.sauna.shorts === 0, `the bot rule for two minutes at 30 km/h: no fail, ${Math.round(H.saunaResult(calm.m.sauna).inBand * 100)} % green`);
  missionCleanup(calm.G, calm.m, true);
}

group('abort from every stage');
for (let i = 0; i < 6; i++) {
  const Gx = freshG();
  G = Gx;
  const mx = { def, stages: def.build({}), idx: i, target: null };
  Gx.veh.x = HOSP.x - 10500; Gx.veh.z = HOSP.z;
  stageEnter(Gx, mx, mx.stages[i]);
  for (let k = 0; k < 10; k++) { mx.target = stageTarget(Gx, mx, mx.stages[i]); stageStep(Gx, mx, mx.stages[i], DT); }
  missionCleanup(Gx, mx, true);
  ok(Gx.sauna == null && Gx.mealShift == null && !Gx.radio.suspended, `abort in stage ${i} (${mx.stages[i].kind}) leaves nothing behind`);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
