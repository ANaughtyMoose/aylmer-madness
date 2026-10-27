// [w6-crashnight] C-04 Crash Night scoring core.
import { CRASH, WAVE, billFor, CrashScore, scoreable, stunCar, tryLine } from '../src/game/crashnight.js';
import { knockDamage } from '../src/game/cars.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL ' + m); } };

ok(WAVE.length === 8, 'wave of 8');
ok(WAVE.every((w) => ['caravan', 'cutlass', 'benz'].includes(w.spec)), 'non-cast models only');
const k90 = knockDamage(90 / 3.6);
ok(Math.abs(billFor(k90) - 4836) < 60, '90 km/h hit about 4 836 $: ' + billFor(k90));
ok(billFor(CRASH.carCap) === 5700, 'car cap 5 700 $');

const s = new CrashScore();
const a = {}, b = {}, c = {};
let r = s.hit(a, 50);
ok(r.dollars === billFor(50) && !r.totalLoss, 'first hit billed');
r = s.hit(a, 30);
ok(r.totalLoss && r.dollars === billFor(10), 'cap at 60 pts, total loss');
r = s.hit(a, 30);
ok(r.dollars === 0 && s.losses === 1, 'capped car adds nothing, one loss');
s.hit(b, 20, 'chain');
ok(Math.abs(s.per.get(b) - 10) < 1e-9, 'chain bills half');
s.hit(c, 0);
ok(s.cars === 2, 'zero hit is not a car');
ok(Math.abs(s.mult - 1.15) < 1e-9, 'x1.15 for 2 cars');
ok(s.total === Math.round(billFor(70) * 1.15 / 10) * 10, 'total: ' + s.total);
for (let i = 0; i < 5; i++) s.hit({}, 5);
ok(Math.abs(s.mult - 1.9) < 1e-9, '7 cars = x1.9');
s.reset();
ok(s.total === 0 && s.cars === 0 && s.losses === 0, 'reset');

const wave = new Set([a]);
ok(scoreable(a, wave) && !scoreable(b, wave), 'wave only');
ok(!scoreable({ kind: 'bike' }, new Set()), 'bikes never');
const st = stunCar({ speed: 9 }, 4);
ok(st.stunT === 4 && st.speed === 0 && st.horn === 1, 'stun');
ok(tryLine(0, { total: 9340, cars: 3, losses: 1 }) === 'ESSAI 1 : 9 340 $ · 3 chars · 1 perte totale', 'card line');

console.log(fails ? `smoke_crashnight: ${fails} FAIL` : 'smoke_crashnight: ok');
process.exit(fails ? 1 : 0);
