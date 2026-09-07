import { Vehicle, carById } from '../src/game/cars.js';
import { SURF } from '../src/game/terrain.js';
import { MAP } from '../src/game/mapdata.js';
import { BIKES } from '../src/game/bikes.js';

const flatOut = (spec, kind, secs = 40) => {
  const world = {
    roadAt: () => kind === 'asphalt', querySegments: () => [], queryPoles: () => [],
    waterAt: () => false, groundAt: () => ({ h: 0, nx: 0, ny: 1, nz: 0, kind }),
    groundY: () => 0, bounds: MAP.bounds,
  };
  const v = new Vehicle(spec);
  v.reset(0, 0, 0);
  const ctl = { steer: 0, throttle: 1, brake: 0, handbrake: false };
  for (let i = 0; i < 60 * secs; i++) v.update(1 / 60, ctl, world);
  return v.speedKmh;
};
const KINDS = ['asphalt', 'path', 'gravel', 'grass', 'sand'];
const rows = [];
for (const id of ['ranger', 'civic', 'saturn', 'sunfire', 'caravan', 'bus', 'cart']) {
  const spec = carById(id);
  if (!spec) { console.log('no car', id); continue; }
  rows.push([spec.name.slice(0, 22), ...KINDS.map((k) => flatOut(spec, k).toFixed(1))]);
}
for (const b of (BIKES || [])) rows.push(['BIKE ' + b.name.slice(0,17), ...KINDS.map((k) => flatOut(b, k).toFixed(1))]);
console.log(['vehicle'.padEnd(24), ...KINDS.map((k) => k.padStart(8))].join(''));
for (const r of rows) console.log([r[0].padEnd(24), ...r.slice(1).map((v) => String(v).padStart(8))].join(''));
console.log('\nSURF.path =', JSON.stringify(SURF.path));
