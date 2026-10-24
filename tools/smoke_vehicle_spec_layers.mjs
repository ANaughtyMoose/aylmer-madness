// An upgraded sheet inherits stock fields. Every runtime modifier must retain
// them, or driving becomes NaN (and the engine falls silent).
import assert from 'node:assert/strict';
import { carById } from '../src/game/cars.js';
import { tuned } from '../src/game/upgrades.js';
import { Weather } from '../src/game/weather.js';
import { specFor } from '../src/game/skills.js';
import { tickFuel } from '../src/game/fuel.js';
const base=carById('ranger'), upgraded=tuned(base,{moteur:3});
const weather=new Weather();weather.wet=1;
const wet=weather.specFor(upgraded);
const skilled=specFor(wet,{stats:{skBrake:1,skCorner:1,skLaunch:1}});
const empty=tickFuel({fuel:0,fuelT:0},1/60,{baseSpec:upgraded,spec:skilled,vLong:0},0,false);
for(const sheet of [upgraded,wet,skilled,empty]){
 assert.equal(sheet.id,'ranger');
 for(const k of ['mass','len','wheelbase','topSpeed','grip','brake','accel']) assert.ok(Number.isFinite(sheet[k]),k);
 assert.equal(sheet.drive,base.drive);assert.equal(sheet.sound,base.sound);
}
assert.ok(wet.grip<upgraded.grip);
assert.ok(skilled.grip>wet.grip);
assert.ok(skilled.accel>upgraded.accel);
assert.equal(empty.accel,0);
assert.equal(weather.specFor(upgraded),wet);
assert.equal(base.accel*1.36,upgraded.accel);
console.log('PASS: upgraded, wet, skilled and empty-tank sheets retain complete vehicle specs');

// ---- every vehicle in town, not only the Ranger (review D, 29 Sep 2026) ----
// All parts maxed, a soaked road, every skill maxed and a dry tank, stacked in
// the order main.js stacks them. Every field the stock sheet has must still be
// there and still be the same kind of thing; every number must be finite; and
// the brake layers must all move the S-key stop (`dirBrake`) the way they move
// the pedal, or the modifier is decoration (review A1).
{
  const { CARS, Vehicle } = await import('../src/game/cars.js');
  await import('../src/game/speeds.js');
  const { PARTS } = await import('../src/game/upgrades.js');
  const { hasTank } = await import('../src/game/fuel.js');
  const max = {}; for (const p of PARTS) max[p.id] = p.levels.length;
  const stats = { skBrake: 1, skCorner: 1, skLaunch: 1 };
  const road = { roadAt: () => true, waterAt: () => false, querySegments: () => [], bounds: { minX: -1e5, maxX: 1e5, minZ: -1e5, maxZ: 1e5 } };
  assert.ok(CARS.length >= 21, `only ${CARS.length} vehicles loaded`);
  const w = new Weather(); w.wet = 1;
  for (const c of CARS) {
    const up = tuned(c, max);
    const wetS = w.specFor(up);
    const sk = specFor(wetS, { stats });
    const dry = tickFuel({ fuel: 0, fuelT: 0 }, 1 / 60, { baseSpec: up, spec: sk, vLong: 0 }, 0, false);
    const layers = { up, wetS, sk };
    if (hasTank(up)) { assert.ok(dry, `${c.id}: a dry tank must hand back a sheet`); layers.dry = dry; }
    for (const [name, sheet] of Object.entries(layers)) {
      const at = `${c.id}/${name}`;
      assert.equal(sheet.id, c.id, at);
      for (const k in c) {
        const v0 = c[k], v1 = sheet[k];
        assert.ok(v1 !== undefined || v0 === undefined, `${at}: lost ${k}`);
        if (typeof v0 === 'number') assert.ok(Number.isFinite(v1), `${at}: ${k} = ${v1}`);
        else if (v0 && typeof v0 === 'object' && k !== 'tune') assert.equal(typeof v1, 'object', `${at}: ${k}`);
      }
      for (const k of ['mass', 'len', 'wheelbase', 'topSpeed', 'grip', 'brake', 'dirBrake', 'accel', 'steerMax', 'vPow'])
        assert.ok(Number.isFinite(sheet[k]), `${at}: ${k} = ${sheet[k]}`);
      assert.equal(sheet.drive, c.drive, `${at}: drive`); assert.equal(sheet.sound, c.sound, `${at}: sound`);
      assert.equal(sheet.feel, c.feel, `${at}: feel`);
      if (sheet.speedCap) assert.ok(sheet.topSpeed <= sheet.speedCap + 1e-9, `${at}: advertises ${sheet.topSpeed * 3.6} past its ${sheet.speedCap * 3.6} limiter`);
    }
    assert.ok(up.dirBrake > c.dirBrake, `${c.id}: Freins must raise the S-key stop`);
    assert.ok(wetS.dirBrake < up.dirBrake, `${c.id}: rain must soften the S-key stop`);
    assert.ok(sk.dirBrake > wetS.dirBrake, `${c.id}: the brake skill must firm the S-key stop`);
    if (layers.dry) assert.equal(layers.dry.accel, 0, `${c.id}: dry tank`);
    // And the whole stack drives: flat out, then a handbrake turn, then S to a stop.
    const v = new Vehicle(layers.dry || sk); v.reset(0, 0, 0); v.vz = 15; v.syncFrame && v.syncFrame();
    for (let i = 0; i < 600; i++) {
      const t = i / 60;
      v.update(1 / 60, { steer: t > 4 ? 1 : 0, throttle: t < 6 ? 1 : 0, brake: t >= 6 ? 1 : 0, handbrake: t > 4 && t < 6 }, road);
      assert.ok(Number.isFinite(v.x + v.z + v.vLong + v.yaw), `${c.id}: NaN at ${t.toFixed(2)} s`);
      if (v.box) assert.ok(Number.isFinite(v.box.rpm), `${c.id}: rpm NaN`);
    }
  }
  console.log(`PASS: all ${CARS.length} vehicles keep complete, finite specs through upgrades, rain, skills and an empty tank`);
}
