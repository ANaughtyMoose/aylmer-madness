import { Vehicle, carById } from '../src/game/cars.js';
import { SURF } from '../src/game/terrain.js';
import { MAP } from '../src/game/mapdata.js';
import { BIKES } from '../src/game/bikes.js';
const flatOut = (spec, kind, secs = 40) => {
  const world = { roadAt: () => kind === 'asphalt', querySegments: () => [], queryPoles: () => [],
    waterAt: () => false, groundAt: () => ({ h: 0, nx: 0, ny: 1, nz: 0, kind }), groundY: () => 0, bounds: MAP.bounds };
  const v = new Vehicle(spec); v.reset(0, 0, 0);
  const ctl = { steer: 0, throttle: 1, brake: 0, handbrake: false };
  for (let i = 0; i < 60 * secs; i++) v.update(1 / 60, ctl, world);
  return v.speedKmh;
};
const cands = [
  [0.75, 0.82, 1.35], [0.86, 0.86, 1.15], [0.90, 0.86, 1.10], [0.92, 0.87, 1.08], [0.94, 0.88, 1.05], [0.88, 0.86, 1.20],
];
console.log('power grip drag |  ranger  civic  caravan   bus    cart   bike1  bike2');
for (const [p, g, d] of cands) {
  SURF.path.power = p; SURF.path.grip = g; SURF.path.drag = d;
  const r = ['ranger','civic','caravan','bus','cart'].map((id)=>flatOut(carById(id),'path').toFixed(1).padStart(7));
  const b = BIKES.map((x)=>flatOut(x,'path').toFixed(1).padStart(7));
  console.log(`${p} ${g} ${d} |${r.join('')}${b.join('')}`);
}
