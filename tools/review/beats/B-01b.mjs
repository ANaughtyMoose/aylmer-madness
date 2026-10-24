// B-01b script beat: never stranded at a job start, in the real game.
// A plan runs it as { "do": "script", "id": "B-01b", "vehicle": false }.
//
// Until B-12a wires ensureOwnVehicle into startMission, this beat stands in for
// that call site: for each of stvincent, russellroyal and racecivic it puts the
// player in the club's cart with the Ranger parked at 299 Fraser, calls
// jobready.ensureOwnVehicle(def, G) in the page, and reads which vehicle the
// player is in. Then the same from Tom's bike, and the garage hand-back. It
// never starts a job and puts the vehicle and every parked car back at the end.
const JOBS = ['stvincent', 'russellroyal', 'racecivic'];

export async function run(page, assert) {
  const before = await page.carState();
  const rows = await page.evaluate(`(async () => {
    const G = window.AYLMER.G;
    const J = await import('/src/game/jobready.js');
    const GA = await import('/src/game/garage.js');
    const M = await import('/src/game/missions.js');
    const P = await import('/src/game/places.js');
    const cur = () => (G.veh && G.veh.spec && G.veh.spec.id) || G.carId;
    const into = (id) => {
      if (cur() === id) return;
      G.parked[id] = { x: G.veh.x, z: G.veh.z, yaw: G.veh.yaw };
      G.swapCar(id);
    };
    const home = P.PLACES.home;
    const ranger = { x: home.x, z: home.z, yaw: 0 };
    const club = { x: 5360, z: -2528, yaw: -Math.PI / 2 };
    const out = [];
    const trial = (from, id) => {
      into('ranger');
      G.veh.reset(club.x, club.z, club.yaw, G.phys && G.phys.groundY ? G.phys.groundY(club.x, club.z) : 0);
      into(from);
      G.parked.ranger = { ...ranger };
      const def = M.ALL_MISSIONS.find((d) => d.id === id);
      const t0 = performance.now();
      const r = J.ensureOwnVehicle(def, G);
      const ms = performance.now() - t0;
      out.push({ job: id, from, kind: r.kind, role: r.role, action: r.action, vehicle: cur(), line: r.line,
        distM: Math.round(Math.hypot(G.veh.x - club.x, G.veh.z - club.z)), ms: +ms.toFixed(2) });
    };
    for (const id of ${JSON.stringify(JOBS)}) trial('cart', id);
    trial('dbike', 'stvincent');
    // The hand-back: from the cart, the Ranger parked 20 m off.
    into('ranger');
    into('cart');
    G.parked.ranger = { x: G.veh.x + 20, z: G.veh.z, yaw: 0 };
    const h = GA.handBack(G);
    out.push({ job: 'handBack', from: 'cart', action: h.ok ? 'swap' : 'fail', vehicle: cur() });
    return out;
  })()`);
  for (const r of rows) {
    if (r.job === 'handBack') { assert.equal(r.vehicle, 'ranger', 'garage hand-back from the cart puts you in the Ranger'); continue; }
    assert(r.vehicle !== r.from || r.action === 'refuse', `${r.job} from the ${r.from}: does not start in the ${r.from} (${r.action})`);
    assert(r.action === 'swap' || r.action === 'refuse', `${r.job}: swap or refuse, got ${r.action}`);
    if (r.action === 'swap') assert(r.distM <= 15, `${r.job}: the Ranger is at the pillar (${r.distM} m)`);
  }
  await page.shot('B-01b-after-swap');
  await page.setCar({ vehicle: before.vehicle, parked: before.parked, damage: before.damage, money: before.money, done: before.done });
  assert.equal(await page.vehicle(), before.vehicle, 'the beat puts the vehicle back');
  return { rows, maxMs: Math.max(...rows.filter((r) => r.ms != null).map((r) => r.ms)) };
}
