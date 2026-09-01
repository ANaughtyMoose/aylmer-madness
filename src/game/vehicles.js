// The one door main.js opens onto the vehicles that are not cars.
//
// Importing this registers the rebodied city bus, the school bus and the two
// bicycles in the CARS table, in the garage's unlock rules, and in save.js's
// owner map. What main.js has to do about it is three lines: merge
// VEHICLE_OWNERS into its own owner map so the bikes park at the right houses,
// call vehicleTick() with the control record before the vehicle integrates it,
// and call drawTwoWheeler() from drawCar so a bicycle gets its fork, its bars
// and its rider.
//
// TO FOLD BACK INTO cars.js LATER: everything in buses.js and bikes.js that is
// per-vehicle data — the HANDBRAKE / REVERSE / SOUND / DRIVE rows, the lamp
// boxes, and the two bus bodies, which are ordinary lofts and want to be
// addDetails() branches like every other car's.
import { OWNER as SAVE_OWNER } from './save.js';
import { CITY_BUS, SCHOOL_BUS } from './buses.js';
import { BIKES, bikeControl, bikeState, drawTwoWheeler } from './bikes.js';
import { lampMeshes } from './vehiclekit.js';

export { CITY_BUS, SCHOOL_BUS, BIKES, bikeState };

// Whose driveway each one lives in. `steph` is the historical key for Sayyad's
// house at 75 Denise-Friend and `home` is 299 Chemin Fraser; `aigle` is École
// de l'Aigle, where the school bus has been sitting since the last day of June.
export const VEHICLE_OWNERS = {
  schoolbus: 'aigle',
  cruiser: 'steph',
  dbike: 'home',
};
Object.assign(SAVE_OWNER, VEHICLE_OWNERS);

// Every spec that builds its own meshes rather than being lofted by cars.js.
const OURS = [CITY_BUS, SCHOOL_BUS, ...BIKES];

let installed = false;

/**
 * Swap in the bodies, wheels and lamps main.js built out of cars.js's loft for
 * the four vehicles that build their own. Runs once, on the first tick after
 * the meshes exist; everything after that is a boolean.
 */
export function installVehicleMeshes(G) {
  if (installed || !G || !G.renderer || !G.meshes || !G.meshes.cars) return;
  const r = G.renderer;
  for (const s of OURS) {
    if (s.buildBody) G.meshes.cars[s.id] = r.upload(s.buildBody(s));
    if (s.buildWheel) G.meshes.wheels[s.id] = r.upload(s.buildWheel(s));
    // A bicycle throws no headlight beam down chemin d'Aylmer at night.
    if (s.twoWheel && G.meshes.cones) G.meshes.cones[s.id] = null;
    if (s.lamps && G.fx && G.fx.lamps) {
      const L = lampMeshes(s.lamps), up = {};
      for (const k of Object.keys(L)) up[k] = r.upload(L[k]);
      G.fx.lamps[s.id] = up;
    }
  }
  installed = true;
}

/** Called from tick(), before the vehicle integrates the controls. */
export function vehicleTick(G, ctl, dt) {
  installVehicleMeshes(G);
  bikeControl(G, ctl, dt);
}

/**
 * Called from drawCar(). A no-op for anything on four wheels; for a two-wheeler
 * it adds the parts that turn with the bars and, when somebody is on it, the
 * rider. `spec.rider` is set on the cloned specs traffic.js gives its cyclists.
 */
export function drawVehicleExtras(G, spec, x, z, yaw, roll, spin, steer, y) {
  if (!spec.twoWheel) return;
  installVehicleMeshes(G);
  const ridden = spec.rider === true || (G.veh && spec === G.veh.spec);
  drawTwoWheeler(G, spec, x, z, yaw, roll, spin, steer, y, ridden);
}
