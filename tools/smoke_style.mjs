#!/usr/bin/env node
// The style chain (plan v2, B-03):  node tools/smoke_style.mjs
//
//   1. the chain: rises on synthetic events, steps x1 -> x2 -> x3 and caps at
//      x3, lapses 3 s after its last event, oncoming metres keep it alive
//   2. the table: each event pays PAY[kind] x the multiplier; no pay for a
//      near miss under 50 km/h closing or over 1.5 m; free roam pays (S1-B03),
//      replays and courses show the chain and pay nothing (styleTipsPaying)
//   3. sense(): traffic near misses, the oncoming lane, a handbrake slide and a
//      landing become events from plain vehicle state; the wrong side of the
//      street comes from traffic.js's real road graph (laneSide)
//   4. the friend line: x3 held 10 s asks once per chain; every line it can
//      ever pick is a main-cast friend's own English line (smoke_lang's
//      speakerLines), never a heckle, ambient or walk-on pool
//   5. the end of the job: with the chain live the 8 / 9 / 5 and 22 $ caps no
//      longer bind; a clean alternateur and canot driven on a two-way street
//      among moving oncoming cars (positions only: near misses from traffic.js's
//      own nearMiss(), the wrong side from laneSide(), everything through
//      sense() and tick(), no private field written) pay 40 to 90 $ more when
//      driven with style than the same runs in your own lane
//   6. cost: one tick + sense against 60 traffic cars, per frame, under the
//      0.10 ms cap (node, indicative)
//   7. reactive.js: tips go to the chain's own HUD slot (hud.styleTip), one per
//      step, never the shared toast queue; traffic near misses never touch
//      G.stats.nearMiss, so cops.js draws no heat from threading traffic
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

const S = await import('../src/game/style.js');
const K = await import('../src/game/missionkit.js');
const M = await import('../src/game/missions.js');
const L = await import('./smoke_lang.mjs');
const { AIR } = await import('../src/game/jumps.js');
const { Traffic } = await import('../src/game/traffic.js');
const { Reactive, tipText } = await import('../src/game/reactive.js');
const { Cops } = await import('../src/game/cops.js');

const DT = 1 / 60;
const ONC = S.ONCOMING;
const NEAR_OK = { kind: 'near', gap: 0.8, speed: 70 / 3.6 };
const run = (c, secs, events = null, opts = {}) => {
  let pay = 0; const toasts = []; let friend = null;
  const n = Math.round(secs / DT);
  for (let i = 0; i < n; i++) {
    const r = c.tick(DT, i === 0 && events ? events : null, opts);
    pay += r.pay; toasts.push(...r.toasts); if (r.friend) friend = r.friend;
  }
  return { pay, toasts, friend };
};

// ---------------------------------------------------------------- 1. the chain
group('1. the chain');
{
  ok(S.STYLE.max === AIR.comboMax && S.STYLE.max === 3, 'the ceiling is AirScorer\'s comboMax (x3)', `x${S.STYLE.max}`);
  ok(Math.abs(S.STYLE.decay - 3) < 1e-9 && S.STYLE.decay === AIR.comboWindow / 2, 'the decay is 3 s, half of AirScorer\'s comboWindow');
  const c = new S.StyleChain();
  const mults = [];
  for (let i = 0; i < 8; i++) { c.tick(DT, [NEAR_OK], { paying: true }); mults.push(c.mult); run(c, 1); }
  ok(mults.join(',') === '1,1,2,2,2,3,3,3', 'rises x1, x1, x2, x2, x2, x3, then holds at x3', mults.join(','));
  ok(Math.max(...mults) === 3 && c.best === 3, 'never above x3');
  // Decay: alive at 2.9 s, gone by 3.05 s.
  const d = new S.StyleChain();
  d.tick(DT, [NEAR_OK], { paying: true });
  run(d, 2.9);
  ok(d.hudState().on, 'still on 2.9 s after the last event');
  run(d, 0.15);
  ok(!d.hudState().on && d.mult === 1 && d.n === 0, 'lapsed by 3.05 s', `n ${d.n}`);
  // Oncoming keeps it alive.
  const h = new S.StyleChain();
  h.tick(DT, [NEAR_OK], { paying: true });
  for (let i = 0; i < 6 / DT; i++) h.tick(DT, [{ kind: 'hold' }], { paying: true });
  ok(h.hudState().on, 'six seconds in the oncoming lane keep the chain alive');
}

// ---------------------------------------------------------------- 2. the table
group('2. the table');
{
  const c = new S.StyleChain();
  const tips = [];
  for (let i = 0; i < 7; i++) tips.push(c.tick(DT, [NEAR_OK], { paying: true }).pay);
  const want = [1, 1, 2, 2, 2, 3, 3].map((m) => S.PAY.near * m);
  ok(tips.join(',') === want.join(','), 'near misses pay PAY.near x the chain', tips.join(','));
  const r = c.tick(DT, [{ kind: 'oncoming', metres: 50 }, { kind: 'slide', seconds: 2.3 }, { kind: 'air', air: 1.4 }], { paying: true });
  ok(r.pay === 3 * (S.PAY.oncoming + (S.PAY.slide + 1) + S.PAY.air), 'oncoming, slide (+1 $ a second past the first) and air pay by the table at x3', `${r.pay} $`);
  ok(r.toasts.length === 3 && r.toasts.every((t) => t.ms <= 1500), 'one toast request per event', r.toasts.map((t) => t.text).join(' | '));
  ok(/^\+\d+ \$ FRÔLÉ x3$/.test(c.tick(DT, [NEAR_OK], { paying: true }).toasts[0].text), 'the toast reads « +12 $ FRÔLÉ x3 »');
  const slow = new S.StyleChain();
  const s1 = slow.tick(DT, [{ kind: 'near', gap: 0.5, speed: 49 / 3.6 }], { paying: true });
  ok(s1.pay === 0 && slow.n === 0 && s1.toasts.length === 0, 'no pay, no chain, at 49 km/h closing');
  const s2 = slow.tick(DT, [{ kind: 'near', gap: 1.6, speed: 90 / 3.6 }], { paying: true });
  ok(s2.pay === 0 && slow.n === 0, 'no pay at 1.6 m of air');
  const s3 = slow.tick(DT, [{ kind: 'near', gap: 1.5, speed: 51 / 3.6 }], { paying: true });
  ok(s3.pay === S.PAY.near, 'pays at 1.5 m and 51 km/h closing', `${s3.pay} $`);
  ok(slow.tick(DT, [{ kind: 'slide', seconds: 0.6 }], { paying: true }).pay === 0, 'a 0.6 s skid is not a slide');
  ok(slow.tick(DT, [{ kind: 'air', air: 0.8 }], { paying: true }).pay === 0, 'a 0.8 s hop is not air (AIR.comboMin)');
  const free = new S.StyleChain();
  const f = free.tick(DT, [NEAR_OK, NEAR_OK, NEAR_OK], { paying: false });
  ok(f.pay === 0 && free.mult === 2 && f.toasts.every((t) => !/\$/.test(t.text)), 'not paying: the chain still counts and shows, without a dollar sign', f.toasts.map((t) => t.text).join(' | '));
  // Who pays.
  const def = M.ALL_MISSIONS.find((d) => d.id === 'alternateur');
  ok(K.styleTipsPaying({}) === K.STYLE_FREE_ROAM, 'free roam pays tips (S1-B03: STYLE_FREE_ROAM)', `${K.STYLE_FREE_ROAM}`);
  ok(K.styleTipsPaying({ mission: { def, styleStart: {} }, done: new Set() }), 'a first run of a job pays tips');
  ok(!K.styleTipsPaying({ mission: { def, styleStart: {} }, done: new Set(['alternateur']) }), 'a replay pays none');
  ok(!K.styleTipsPaying({ mission: { def, styleStart: { replay: true } }, done: new Set() }), 'nor a run flagged as a replay');
  ok(!K.styleTipsPaying({ mission: { def: { id: 'x', mode: 'sprint', course: {} }, styleStart: {} } }), 'nor an M-menu course (it pays its purse)');
}

// ---------------------------------------------------------------- 3. sense
group('3. sense()');
{
  const c = new S.StyleChain();
  const v = { x: 0, z: 0, vx: 0, vz: 70 / 3.6, vLong: 70 / 3.6, yaw: 0, skid: 0, landed: 0, lastAir: 0, inAir: false };
  // A car 20 m ahead, in your lane, coming at you at 50 km/h: you are on the wrong side.
  const cars = [{ x: 0.6, z: 20, vx: 0, vz: -50 / 3.6 }];
  let oncoming = 0, held = 0;
  for (let i = 0; i < 3 / DT; i++) {
    const ev = c.sense(DT, v, null, cars);
    oncoming += ev.filter((e) => e.kind === 'oncoming').length;
    held += ev.some((e) => e.kind === 'hold') ? 1 : 0;
  }
  ok(c.oncomingM > 57 && c.oncomingM < 60 && oncoming === 1, 'three seconds at 70 km/h in the oncoming lane: 58 m, one paid event', `${c.oncomingM.toFixed(1)} m, ${oncoming} events`);
  const c2 = new S.StyleChain();
  const own = [{ x: -3.4, z: 20, vx: 0, vz: -50 / 3.6 }];   // the same car in its own lane
  for (let i = 0; i < 60; i++) c2.sense(DT, v, null, own);
  ok(c2.oncomingM === 0, 'a car passing in its own lane is not oncoming');
  const same = [{ x: 0.3, z: 20, vx: 0, vz: 40 / 3.6 }];   // a car ahead going your way
  for (let i = 0; i < 60; i++) c2.sense(DT, v, null, same);
  ok(c2.oncomingM === 0, 'a car ahead going your way is not oncoming');
  const slowV = { ...v, vz: 40 / 3.6, vLong: 40 / 3.6 };
  for (let i = 0; i < 60; i++) c2.sense(DT, slowV, null, cars);
  ok(c2.oncomingM === 0, 'under 50 km/h the oncoming lane does not count');
  // The slide: 1.4 s of a big skid at 45 km/h, then grip.
  const c3 = new S.StyleChain();
  const sv = { ...v, vz: 45 / 3.6, vLong: 45 / 3.6, skid: 0.6 };
  let slides = [];
  for (let i = 0; i < 1.4 / DT; i++) slides.push(...c3.sense(DT, sv, null, null, true));
  sv.skid = 0.05;
  for (let i = 0; i < 0.3 / DT; i++) slides.push(...c3.sense(DT, sv, null, null, true));
  slides = slides.filter((e) => e.kind === 'slide');
  ok(slides.length === 1 && Math.abs(slides[0].seconds - 1.4) < 0.05, 'a 1.4 s handbrake slide is one slide event', slides.map((e) => e.seconds.toFixed(2)).join(','));
  const c4 = new S.StyleChain();
  let none = [];
  sv.skid = 0.6;
  for (let i = 0; i < 1.4 / DT; i++) none.push(...c4.sense(DT, sv, null, null, false));
  sv.skid = 0.05;
  for (let i = 0; i < 0.3 / DT; i++) none.push(...c4.sense(DT, sv, null, null, false));
  ok(!none.some((e) => e.kind === 'slide'), 'the same skid without the handbrake (when known) is not a style slide');
  const c5 = new S.StyleChain();
  const air = c5.sense(DT, { ...v, landed: 3, lastAir: 1.3 }, [{ gap: 0.9, speed: 20, kind: 'car' }], null);
  ok(air.some((e) => e.kind === 'air' && e.air === 1.3) && air.some((e) => e.kind === 'near' && e.gap === 0.9), 'a landing and a traffic near miss come through as events');
}

// ---------------------------------------------------------------- 3b. the road graph
group('3b. the wrong side of the street, from the road graph');
// A straight two-way street with the same shape as traffic.js's graph (nodes,
// directed edges both ways, a midpoint grid of 100 m cells, cellKey), so the
// drives below run on the very lookup the game uses. Travel is +x; traffic
// keeps right, so your lane is z = +off and the oncoming lane z = -off.
function straightRoad(len = 30000, off = 2.5) {
  const nodes = [], edges = [], grid = new Map();
  for (let x = 0; x <= len; x += 100) nodes.push({ x, z: 0, out: [] });
  const net = { nodes, edges, grid, gx0: -200, gz0: -200, gw: Math.ceil((len + 400) / 100) + 1, gh: 5,
    cellKey(x, z) {
      const ix = Math.max(0, Math.min(this.gw - 1, Math.floor((x - this.gx0) / 100)));
      const iz = Math.max(0, Math.min(this.gh - 1, Math.floor((z - this.gz0) / 100)));
      return iz * this.gw + ix;
    } };
  const link = (a, b) => {
    const A = nodes[a], B = nodes[b], l = Math.hypot(B.x - A.x, B.z - A.z);
    edges.push({ a, b, len: l, dx: (B.x - A.x) / l, dz: (B.z - A.z) / l, off, cls: 'tertiary', oneway: false });
    const k = net.cellKey((A.x + B.x) / 2, (A.z + B.z) / 2);
    (grid.get(k) || grid.set(k, []).get(k)).push(edges.length - 1);
  };
  for (let i = 0; i + 1 < nodes.length; i++) { link(i, i + 1); link(i + 1, i); }
  return net;
}
{
  const net = straightRoad(2000);
  const at = (x, z) => S.laneSide(net, x, z, 1, 0);
  ok(at(500, 2.5).lateral > 2.4 && at(500, -2.5).lateral < -2.4, 'laneSide: +2.5 m in your lane, -2.5 m in the oncoming one', `${at(500, 2.5).lateral.toFixed(2)} / ${at(500, -2.5).lateral.toFixed(2)}`);
  ok(S.laneSide(net, 500, -2.5, -1, 0).lateral > 2.4, 'turn round and the same spot is your own lane');
  ok(at(500, 40) === null, '40 m off the street is not on a street');
  // The real graph: the longest two-way edge in Aylmer, both sides.
  const tr = new Traffic(26, 7);
  let e = null;
  for (const ed of tr.edges) if (!ed.oneway && (!e || ed.len > e.len)) e = ed;
  const A = tr.nodes[e.a];
  let right = 0, wrong = 0;
  for (const f of [0.05, 0.5, 0.95]) {
    const px = A.x + e.dx * e.len * f, pz = A.z + e.dz * e.len * f;
    const own = S.laneSide(tr, px - e.dz * e.off, pz + e.dx * e.off, e.dx, e.dz);
    const opp = S.laneSide(tr, px + e.dz * e.off, pz - e.dx * e.off, e.dx, e.dz);
    if (own && own.lateral > 0) right++;
    if (opp && opp.lateral < -ONC.roadMin && !opp.oneway) wrong++;
  }
  ok(right === 3 && wrong === 3, `the real graph: a ${Math.round(e.len)} m straight reads own lane and wrong side at its start, middle and end`, `${right}/3, ${wrong}/3`);
  // sense() with the road: the wrong side pays only with oncoming traffic.
  const ride = (z, cars, secs) => {
    const c = new S.StyleChain();
    const v = { x: 100, z, vx: 70 / 3.6, vz: 0, vLong: 70 / 3.6, skid: 0, landed: 0, lastAir: 0, inAir: false };
    let paid = 0;
    for (let i = 0; i < secs / DT; i++) {
      v.x += v.vx * DT;
      for (const k of cars) { k.x += k.vx * DT; k.z += k.vz * DT; }
      const ev = c.sense(DT, v, null, cars, true, net);
      paid += c.tick(DT, ev, { paying: true }).pay;
    }
    return { c, paid };
  };
  const empty = ride(-2.5, [], 6);
  ok(empty.c.oncomingM === 0 && empty.paid === 0, 'six seconds on an empty wrong side: 0 m, 0 $');
  const one = ride(-2.5, [{ x: 400, z: -2.5, vx: -50 / 3.6, vz: 0 }], 12);
  ok(one.c.counts.oncoming >= 2 && one.c.oncomingM > 70 && one.c.oncomingM < 110, 'one car coming at 50 km/h, you at 70 on its side: paid metres from 90 m out to 1.5 s past', `${one.c.oncomingM.toFixed(0)} m, ${one.c.counts.oncoming} events`);
  const ownLane = ride(2.5, [{ x: 400, z: -2.5, vx: -50 / 3.6, vz: 0 }], 12);
  ok(ownLane.c.oncomingM === 0, 'the same car met from your own lane: 0 m');
  const centre = ride(0, [{ x: 400, z: -2.5, vx: -50 / 3.6, vz: 0 }], 12);
  ok(centre.c.oncomingM === 0, 'on the centreline (the bot\'s line): 0 m');
}

// ---------------------------------------------------------------- 4. friend lines
group('4. the friend line');
{
  const c = new S.StyleChain();
  let friend = null, asked = 0;
  for (let i = 0; i < 6; i++) c.tick(DT, [NEAR_OK], { paying: true, friend: 'Sayyad' });
  for (let t = 0; t < 12 / DT; t++) {
    const r = c.tick(DT, t % 120 === 0 ? [NEAR_OK] : null, { paying: true, friend: 'Sayyad' });
    if (r.friend) { friend = r.friend; asked++; }
  }
  ok(asked === 1 && friend && friend.who === 'Sayyad', 'x3 held 10 s asks one line', friend ? friend.line : 'none');
  ok(c.x3T >= 10, 'held at x3', `${c.x3T.toFixed(1)} s`);
  const nobody = new S.StyleChain();
  let any = false;
  for (let i = 0; i < 6; i++) nobody.tick(DT, [NEAR_OK], { paying: true, friend: 'Margaret' });
  for (let t = 0; t < 12 / DT; t++) if (nobody.tick(DT, t % 120 === 0 ? [NEAR_OK] : null, { paying: true, friend: 'Margaret' }).friend) any = true;
  ok(!any, 'nobody without a chain pool says anything');
  const all = S.allFriendLines();
  ok(all.length > 0, `${all.length} lines the chain can pick`);
  for (const [who, line] of all) {
    ok(L.speakerKind(who) === 'main', `${who} is main cast`);
    const en = await L.speakerLines(who, 'en');
    ok(en.includes(line) && L.langOf(line) === 'en', `${who}: « ${line} » is one of ${who}'s own English lines (speakerLines)`);
  }
  // And none of it comes from a walk-on pool.
  const rows = await L.collectLines();
  const walk = new Set(rows.filter((r) => r.kind !== 'main').map((r) => r.text));
  ok(all.every(([, l]) => !walk.has(l)), 'none of them is in a heckle, ambient or walk-on pool');
}

// ---------------------------------------------------------------- 5. the job
group('5. a clean alternateur and canot, with and without style');
function wallet(v = 0) {
  return { value: v, add(n) { this.value = Math.max(0, this.value + n); return this.value; },
    spend(n) { if (this.value < n) return false; this.value -= n; return true; }, can(n) { return this.value >= n; } };
}
// A drive on a straight two-way street at 70 km/h. Oncoming cars come down
// their lane at 50 km/h and meet you at the seconds listed; the only thing that
// changes between the two runs is where you drive. Without style you keep your
// lane (+2.5 m). With style you hug the line (+0.35 m) to pass the `near` cars,
// take the wrong side (-2.5 m) through the `wrong` stretch and duck back to the
// line for each car in it, hold one handbrake slide and land one jump.
// Near misses come from traffic.js's own nearMiss() on these positions, the
// wrong side from laneSide(); sense() and tick() see nothing else.
const SCRIPT = {
  alternateur: { secs: 240, near: [25, 27, 150, 151.5, 153], wrong: [58, 70, [63, 67]],
    quiet: [40, 90, 130, 180, 220], slide: [110, 1.6], air: [205, 1.2] },
  canot: { secs: 420, near: [40, 42, 44, 162, 300, 301, 302.5], wrong: [88, 100, [93, 97]],
    quiet: [60, 130, 200, 250, 360, 400], slide: [160, 1.2], air: [340, 1.1] },
};
const KMH70 = 70 / 3.6, KMH50 = 50 / 3.6;
function drive(id, withStyle) {
  const def = M.ALL_MISSIONS.find((d) => d.id === id);
  const G = { done: new Set(), wallet: wallet(500), payScale: 1, racePayScale: 1, day: 3,
    stats: { nearMiss: 0, jumps: 0, styleTips: 0 } };
  const m = { def, stages: def.build({ carId: 'ranger', carName: 'Ranger', seats: 2, places: 3, money: 0 }),
    idx: 0, elapsed: 0, styleStart: { stats: { ...G.stats }, damage: 0 } };
  G.mission = m;
  const P = SCRIPT[id];
  const net = straightRoad(KMH70 * P.secs + 2000);
  const tr = { time: 0, nearMisses: [], nearLog: [], nearCount: 0, onNearMiss: null };
  const nearMiss = Traffic.prototype.nearMiss;
  const c = new S.StyleChain();
  c.statsInto(G.stats);
  const w0 = G.wallet.value;
  const meets = [...P.near, ...P.wrong[2], ...P.quiet];
  // Each car is where it has to be to meet you at its second: x(t) = 70 T - 50 (t - T) / 3.6 ...
  const cars = meets.map((T) => ({ T, x: 100 + KMH70 * T + KMH50 * T, z: -2.5, vx: -KMH50, vz: 0, len: 4.5, wid: 1.8, nearT: 0, kind: 'car' }));
  const v = { x: 100, z: 2.5, vx: KMH70, vz: 0, vLong: KMH70, skid: 0, landed: 0, lastAir: 0, inAir: false, len: 4.9, wid: 1.8 };
  const want = (t) => {
    if (!withStyle) return 2.5;
    for (const T of P.near) if (t > T - 1.5 && t < T + 0.5) return 0.35;
    const [w0, w1, ducks] = P.wrong;
    if (t > w0 && t < w1) { for (const T of ducks) if (t > T - 1.2 && t < T + 0.4) return 0.35; return -2.5; }
    return 2.5;
  };
  let nearN = 0, slides = 0;
  for (let i = 0; i < P.secs / DT; i++) {
    const t = i * DT;
    const dz = Math.max(-5 * DT, Math.min(5 * DT, want(t) - v.z));
    v.z += dz; v.vz = dz / DT; v.x += v.vx * DT;
    const inSlide = withStyle && t >= P.slide[0] && t < P.slide[0] + P.slide[1];
    v.skid = inSlide ? 0.6 : 0.05;
    const land = withStyle && Math.abs(t - P.air[0]) < DT / 2;
    v.landed = land ? 1 : 0; v.lastAir = land ? P.air[1] : 0;
    tr.time += DT; tr.nearMisses.length = 0;
    for (const k of cars) { k.x += k.vx * DT; if (k.nearT > 0) k.nearT -= DT; nearMiss.call(tr, k, v); }
    const ev = c.sense(DT, v, tr.nearMisses, cars, inSlide, net);
    for (const e of ev) { if (e.kind === 'near') nearN++; if (e.kind === 'slide') slides++; }
    const r = c.tick(DT, ev, { paying: K.styleTipsPaying(G), friend: null });
    if (r.pay) G.wallet.add(r.pay);
    c.statsInto(G.stats);
  }
  for (const st of m.stages) { if (st.cost) G.wallet.add(st.cost); K.stageSettle(G, m, st); }
  const end = K.missionStyleBonus(m.styleStart, G.stats, 0);
  G.wallet.add(end.money);
  return { pay: G.wallet.value - w0, tips: c.total, end, best: c.best, near: nearN, slides, counts: { ...c.counts }, onM: c.oncomingM };
}
for (const id of ['alternateur', 'canot']) {
  const a = drive(id, false), b = drive(id, true);
  const more = b.pay - a.pay;
  ok(a.near === 0 && a.counts.oncoming === 0 && a.tips === 0, `${id}: in your own lane the same traffic is no event`, `${a.near} near, ${a.onM.toFixed(0)} m`);
  ok(b.near === SCRIPT[id].near.length + SCRIPT[id].wrong[2].length, `${id}: every car passed on the line is a traffic near miss (nearMiss())`, `${b.near} near misses`);
  ok(b.counts.oncoming >= 2, `${id}: the wrong-side stretch pays oncoming metres`, `${b.onM.toFixed(0)} m, ${b.counts.oncoming} events`);
  ok(more >= 40 && more <= 90, `${id}: with style pays ${more} $ more (40 to 90)`, `${a.pay} $ -> ${b.pay} $, tips ${b.tips} $, best x${b.best}, ${JSON.stringify(b.counts)}`);
  ok(a.end.money === 5 && b.end.money === 5 && a.end.live, `${id}: the end of the job pays the clean 5 $ either way; the chain paid the rest live`, b.end.text);
  ok(b.end.tips === b.tips, `${id}: the end card reports the tips the chain paid`, `${b.end.tips} $`);
}
{
  // The caps no longer bind with the chain live: 30 near misses, no 8 $ ceiling.
  const c = new S.StyleChain();
  let tips = 0;
  for (let i = 0; i < 30; i++) { tips += c.tick(DT, [NEAR_OK], { paying: true }).pay; run(c, 1); }
  const end = K.missionStyleBonus({ stats: { nearMiss: 0, jumps: 0, styleTips: 0 }, damage: 0 }, { nearMiss: 30, jumps: 0, styleTips: tips }, 0);
  ok(tips > 22 && end.money === 5, 'thirty near misses on one job pay past the old 8 $ and 22 $ caps', `${tips} $ live + ${end.money} $`);
  const legacy = K.missionStyleBonus({ stats: { nearMiss: 4, jumps: 1 }, damage: 12 }, { nearMiss: 7, jumps: 3 }, 14);
  ok(legacy.money === 17 && !legacy.live, 'with no chain (bare stats) the old capped sum stands, so nothing pays twice', `${legacy.money} $`);
}

// ---------------------------------------------------------------- 6. cost
group('6. per-frame cost (node, indicative; cap 0.10 ms)');
{
  const c = new S.StyleChain();
  const cars = [];
  for (let i = 0; i < 60; i++) cars.push({ x: (i % 10) * 9 - 45, z: Math.floor(i / 10) * 15 - 40, vx: 3, vz: -9 });
  const v = { x: 0, z: 0, vx: 0, vz: 19, vLong: 19, yaw: 0, skid: 0.4, landed: 0, lastAir: 0, inAir: false };
  const near = [{ gap: 1, speed: 20 }];
  const N = 20000;
  const tr = new Traffic(26, 7);
  let e = null;
  for (const ed of tr.edges) if (!ed.oneway && (!e || ed.len > e.len)) e = ed;
  const A = tr.nodes[e.a];
  // On the real road graph, on the wrong side of Aylmer's longest straight.
  const vr = { ...v, x: A.x + e.dz * 2.5 + e.dx * 50, z: A.z - e.dx * 2.5 + e.dz * 50, vx: e.dx * 19, vz: e.dz * 19 };
  const carsR = cars.map((k) => ({ ...k, x: vr.x + k.x, z: vr.z + k.z }));
  const stats = {};
  for (let i = 0; i < 2000; i++) c.tick(DT, c.sense(DT, vr, i % 50 ? null : near, carsR, true, tr), { paying: true });
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i++) {
    const ev = c.sense(DT, vr, i % 50 ? null : near, carsR, true, tr);
    c.tick(DT, ev, { paying: true }); c.hudState(); c.statsInto(stats);
  }
  const per = Number(process.hrtime.bigint() - t0) / 1e6 / N;
  ok(per < 0.10, 'sense (with the road lookup every 0.1 s) + tick + hudState + statsInto per frame', `${(per * 1000).toFixed(2)} µs`);
}

// ---------------------------------------------------------------- 7. reactive.js
group('7. reactive.js: the HUD slot and the police');
{
  // Reactive.styleStep on a stand-in for the instance (its chain, its stats),
  // with a HUD that records every call and the real Cops accrual reading G.stats.
  const mk = (withTip = true) => {
    const calls = { toast: [], tip: [] };
    const hud = { toast: (t, ms) => calls.toast.push(t) };
    if (withTip) hud.styleTip = (t, ms) => calls.tip.push(t);
    const near = [];
    const G = { mode: 'drive', hud, wallet: wallet(100), stats: { nearMiss: 0 }, traffic: { nearMisses: near, cars: [], crash: 0 },
      veh: { x: 0, z: 0, vx: 0, vz: 19, vLong: 19, skid: 0, landed: 0, lastAir: 0, inAir: false, speedKmh: 70 }, mission: null };
    const self = { style: new S.StyleChain(), stats: G.stats, friendFor: () => null };
    return { G, self, calls, near };
  };
  const step = Reactive.prototype.styleStep;
  const a = mk();
  const cops = new Cops();
  let heat0 = cops.heat;
  // 20 near misses 0.8 s apart in free roam, the police watching.
  for (let i = 0; i < Math.round(16 / DT); i++) {
    a.near.length = 0;
    if (i % Math.round(0.8 / DT) === 0) a.near.push({ gap: 0.7, speed: 25, kind: 'car' });
    step.call(a.self, DT, a.G, a.G.veh);
    cops._accrue(DT, a.G);
  }
  ok(a.calls.toast.length === 0, 'twenty style tips push nothing on the shared toast queue (hud.toast)', `${a.calls.toast.length} toasts`);
  ok(a.calls.tip.length === 20 && /^\+\d+ \$ FRÔLÉ x\d$/.test(a.calls.tip[19]), 'one hud.styleTip per event, « +12 $ FRÔLÉ x3 »', a.calls.tip.slice(-1)[0]);
  ok(a.G.stats.nearMiss === 0 && a.G.stats.styleNear === 20, 'traffic near misses go to G.stats.styleNear, never G.stats.nearMiss', `nearMiss ${a.G.stats.nearMiss}, styleNear ${a.G.stats.styleNear}`);
  ok(cops.heat === heat0, 'cops.js draws no « conduite dangereuse » heat from threading traffic', `heat ${cops.heat}`);
  ok(a.G.wallet.value > 100 && a.G.stats.styleTips === a.G.wallet.value - 100 && a.G.stats.styleBestChain === 3, 'free roam pays the tips into the wallet; x3 reached', `+${a.G.wallet.value - 100} $`);
  // Before the fix the same run raised G.stats.nearMiss by 20: show the police would have reacted to that.
  const old = new Cops();
  const Gold = { veh: { speedKmh: 70 }, stats: { nearMiss: 0 }, traffic: { crash: 0 } };
  for (let i = 0; i < Math.round(16 / DT); i++) { if (i % Math.round(0.8 / DT) === 0) Gold.stats.nearMiss++; old._accrue(DT, Gold); }
  ok(old.heat > 0, 'control: the same 20 counted on G.stats.nearMiss would have drawn heat', `heat ${old.heat.toFixed(2)}`);
  // Two events in one step: one tip, coalesced.
  const b = mk();
  b.near.push({ gap: 0.7, speed: 25, kind: 'car' }, { gap: 1.1, speed: 22, kind: 'car' });
  step.call(b.self, DT, b.G, b.G.veh);
  ok(b.calls.tip.length === 1 && b.calls.tip[0] === '+8 $ FRÔLÉ x1', 'two near misses in one step: one tip line', b.calls.tip[0]);
  ok(tipText({ pay: 21, toasts: [{ text: '+12 $ FRÔLÉ x3', kind: 'near' }, { text: '+9 $ CONTRESENS x3', kind: 'oncoming' }] }) === '+21 $ FRÔLÉ + CONTRESENS x3', 'mixed kinds read « +21 $ FRÔLÉ + CONTRESENS x3 »');
  // No styleTip slot: nothing goes to the toast queue instead.
  const c = mk(false);
  for (let i = 0; i < 6; i++) { c.near.length = 0; c.near.push({ gap: 0.7, speed: 25, kind: 'car' }); step.call(c.self, DT, c.G, c.G.veh); }
  ok(c.calls.toast.length === 0, 'a HUD without styleTip gets no style toasts at all');
  // A replay pays nothing and shows no tip (the readout still says STYLE xN).
  const d = mk();
  const def = M.ALL_MISSIONS.find((x) => x.id === 'alternateur');
  d.G.mission = { def, styleStart: { replay: true } };
  for (let i = 0; i < 3; i++) { d.near.length = 0; d.near.push({ gap: 0.7, speed: 25, kind: 'car' }); step.call(d.self, DT, d.G, d.G.veh); }
  ok(d.calls.tip.length === 0 && d.G.wallet.value === 100 && d.self.style.hudState().mult === 2, 'a replay: no dollar, no tip line, the chain still counts', `x${d.self.style.hudState().mult}`);
  // A new G.stats (a new game or a load) starts a fresh chain.
  const e2 = mk();
  for (let i = 0; i < 6; i++) { e2.near.length = 0; e2.near.push({ gap: 0.7, speed: 25, kind: 'car' }); step.call(e2.self, DT, e2.G, e2.G.veh); }
  const fresh = { nearMiss: 0 };
  e2.G.stats = fresh; e2.self.stats = fresh;
  e2.near.length = 0;
  step.call(e2.self, DT, e2.G, e2.G.veh);
  ok(e2.self.style.mult === 1 && fresh.styleBestChain === 1 && fresh.styleNear === 0, 'a new G.stats does not inherit the last session\'s chain or best', `x${e2.self.style.mult}, best ${fresh.styleBestChain}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
