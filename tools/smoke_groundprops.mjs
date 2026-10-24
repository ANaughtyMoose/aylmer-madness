#!/usr/bin/env node
// Props placed by the side jobs, the Hangout and the couch lift must sit on the
// terrain, not at absolute y = 0. Raised lot: the ground is faked 19 m up around
// Mike's and 7 m up everywhere else; flat ground must still give the old y.
import { PLACES } from '../src/game/places.js';
import { canot, sayyad, divan, LIFT } from '../src/game/sidejobs.js';
import { COUCH } from '../src/game/landmarks.js';
import { Hangout, loadHangoutContent } from '../src/game/hangout.js';
import { readFileSync, existsSync } from 'node:fs';

let failures = 0;
const ok = (c, m, x = '') => { if (!c) { failures++; console.error('  FAIL ' + m + ' ' + x); } else console.log('  ok   ' + m); };
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

const RAISE = (x, z) => (Math.hypot(x - PLACES.mike.x, z - PLACES.mike.z) < 60 ? 19 : 7);
function mkG(groundY) {
  const props = new Map();
  return {
    props: {
      renderer: null, add(p) { props.set(p.id, p); return p; }, get: (i) => props.get(i) || null,
      has: (i) => props.has(i), remove: (i) => props.delete(i),
      removePrefix(pre) { for (const k of [...props.keys()]) if (k.startsWith(pre)) props.delete(k); },
      size: () => props.size, all: () => [...props.values()],
    },
    phys: groundY ? { groundY } : null,
    hud: { setObjective() {}, prompt() {}, toast() {}, setTimer() {} },
    audio: { blip() {}, chime() {}, crash() {} },
    input: { hit: () => false, consume() {} }, veh: { x: 0, z: 0, speedKmh: 0, spec: { h: 1.8 } },
    envKey: 'night', done: new Set(), playtime: 600, time: 0, wallet: { value: 80, add() {} },
  };
}
const content = await loadHangoutContent(async (url) => {
  const p = url.replace(/\?.*$/, '');
  return existsSync(p) ? { ok: true, json: async () => JSON.parse(readFileSync(p, 'utf8')) } : { ok: false };
});

for (const [label, gy] of [['raised', RAISE], ['flat', null]]) {
  console.log('-- ' + label);
  const g = (x, z) => (gy ? gy(x, z) : 0);

  // Side jobs
  const G = mkG(gy);
  const ctx = { carName: 'Ranger' };
  const cs = canot.build(ctx);
  cs.find((s) => s.at === 'yardsale').onEnter(G, {});
  const sale = G.props.get('side:sale') || G.props.all().find((p) => p.mesh === 'yardsale');
  const lc = G.props.all().find((p) => p.mesh === 'canoe');
  ok(near(sale.y, g(sale.x, sale.z)), 'yard sale on the ground', sale.y);
  ok(near(lc.y, g(lc.x, lc.z) + 0.05), 'lawn canoe on the ground', lc.y);

  const ss = sayyad.build(ctx).find((s) => s.kind === 'doughnuts');
  const m = {}; ss.onEnter(G, m);
  m.donut.meter = { count: 3, update: () => ({}), state: () => ({}) };
  ss.onTick(G, m, { sub: '' }, 0.016);
  const lit = G.props.all().find((p) => p.mesh === 'litwin');
  ok(lit && near(lit.y, g(lit.x, lit.z)), 'Sayyad lit windows on the ground', lit && lit.y);

  const dv = divan.build(ctx).find((s) => s.at === 'mike');
  dv.onEnter(G, {});
  const cl = G.props.all().find((p) => p.mesh === 'couch' && /couchlawn/.test(p.id));
  ok(cl && near(cl.y, g(cl.x, cl.z)), 'couch on Mike\'s lawn on the ground', cl && cl.y);

  // The lift: parked under the fork, E held, the couch rises from the truck to
  // the fork, both heights measured from the local ground.
  const lift = divan.build(ctx).find((s) => s.kind === 'lift');
  const L = mkG(gy);
  L.veh = { x: LIFT.x, z: LIFT.z + 0.15, y: g(LIFT.x, LIFT.z), yaw: 0, speedKmh: 0, spec: { h: 1.8 } };
  L.input.down = (c) => c === 'KeyE';
  const lm = {};
  lift.onEnter(L, lm);
  let res = null, startY = null;
  for (let i = 0; i < 600 && res !== 'done'; i++) {
    res = lift.onTick(L, lm, lift, 1 / 60);
    const p = L.props.get('job:couchlift');
    if (p && startY == null) startY = p.y;
  }
  const up = L.props.get('job:couchlift');
  ok(res === 'done' && lm.couch.up, 'holding E under the fork lifts it in', res);
  ok(startY != null && near(startY, g(LIFT.x, LIFT.z) + 1.86, 0.02), 'it leaves from the roof, above local ground', startY);
  ok(up && near(up.y, g(COUCH.x, COUCH.z) + COUCH.y, 1e-6), 'and ends up in the fork, 5.6 m above the lawn', up && up.y);

  // Hangout
  const H = mkG(gy);
  const h = new Hangout(); h.content = content; h.spawn(H);
  const props = H.props.all();
  const bad = props.filter((p) => !(p.y >= g(p.x, p.z) - 1e-9 && p.y - g(p.x, p.z) < 0.6));
  ok(props.length >= 6 && bad.length === 0, `Hangout props (${props.length}) all on the ground`, bad.map((p) => p.id + ':' + p.y).join(' '));
  const bm = props.find((p) => p.id === 'hang:boombox');
  ok(near(bm.y, g(bm.x, bm.z) + 0.5), 'boombox 0.5 m above ground');
  h.placeBins(H, [{ bins: [{ x: PLACES.mike.x + 5, z: PLACES.mike.z + 5 }] }]);
  const bin = H.props.get('hang:bin0_0');
  ok(near(bin.y, g(bin.x, bin.z)), 'slalom bin on the ground', bin.y);
}
console.log(failures ? failures + ' FAILED' : 'all ok');
process.exit(failures ? 1 : 0);
