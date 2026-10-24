// B-04 script beat: the garnotte ramp is on L'alternateur's GPS line, and a
// truck that follows the line at 60 to 70 km/h flies it with the slow-mo.
//   { "do": "script", "id": "B-04" }            the proof (S3-JUMPS, 20 Oct)
//   { "do": "script", "id": "B-04", "probe": true }   heights + flights on the axis
//
// S3-JUMPS re-land: the first B-04 (13 Oct) was judged by the harness's
// learner bot playing the whole job against a 60 s bar, and reverted because
// the bot missed the lip under load. This beat is judged by geometry instead,
// and it is deterministic: a fresh Ranger is PLACED on the GPS route (home to
// Canadian Tire, the same Nav main.js draws), 55 m short of the lip on chemin
// d'Aylmer, given 60, 65 or 70 km/h, and the sim is stepped at 1/60 s with W
// held as cruise control (on under the target speed, off over it) and A/D
// steering at the route 20 m ahead. Nothing here depends on frame rate or on
// the bot. The job itself is for the human play at the gate (D42).
const GEO = `(async () => {
  const [{ Nav }, { PLACES }, J] = await Promise.all([import('/src/game/nav.js'), import('/src/game/places.js'), import('/src/game/jumps.js')]);
  const j = J.JUMPS.find((x) => x.id === 'garnotte');
  const R = new Nav().route(PLACES.home.x, PLACES.home.z, PLACES.ctire.x, PLACES.ctire.z) || [];
  const cum = [0];
  for (let i = 1; i < R.length; i++) cum.push(cum[i - 1] + Math.hypot(R[i][0] - R[i - 1][0], R[i][1] - R[i - 1][1]));
  let best = { d: Infinity, s: 0 };
  for (let i = 1; i < R.length; i++) {
    const [ax, az] = R[i - 1], [bx, bz] = R[i], ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1e-6;
    const t = Math.max(0, Math.min(1, ((j.x - ax) * ex + (j.z - az) * ez) / l2));
    const d = Math.hypot(ax + ex * t - j.x, az + ez * t - j.z);
    if (d < best.d) best = { d, s: cum[i - 1] + t * Math.sqrt(l2) };
  }
  window.__b04R = { R, cum, sLip: best.s };
  return { routePts: R.length, routeM: Math.round(cum[cum.length - 1]), lipToRouteM: +best.d.toFixed(2), lipAlongM: Math.round(best.s), lip: [j.x, j.z], kmh: j.kmh, predicted: +J.jumpAir(j).toFixed(2) };
})()`;

const FLY = (kmh, back) => `(async () => {
  const A = window.AYLMER, G = A.G, { R, cum, sLip } = window.__b04R;
  const J = await import('/src/game/jumps.js'), j = J.JUMPS.find((x) => x.id === 'garnotte');
  const at = (s) => { s = Math.max(0, Math.min(cum[cum.length - 1], s)); let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
    const t = (s - cum[i - 1]) / ((cum[i] - cum[i - 1]) || 1); return [R[i - 1][0] + (R[i][0] - R[i - 1][0]) * t, R[i - 1][1] + (R[i][1] - R[i - 1][1]) * t]; };
  const sNear = (x, z) => { let b = { d: Infinity, s: 0 }; for (let i = 1; i < R.length; i++) { const [ax, az] = R[i - 1], [bx, bz] = R[i], ex = bx - ax, ez = bz - az, l2 = ex * ex + ez * ez || 1e-6;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2)); const d = Math.hypot(ax + ex * t - x, az + ez * t - z); if (d < b.d) b = { d, s: cum[i - 1] + t * Math.sqrt(l2) }; } return b; };
  const key = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code.slice(3).toLowerCase(), bubbles: true }));
  const held = { KeyW: false, KeyA: false, KeyD: false };
  const hold = (code, on) => { if (held[code] !== on) { held[code] = on; key(on ? 'keydown' : 'keyup', code); } };
  const p0 = at(sLip - ${back}), p1 = at(sLip - ${back} + 5);
  if (G.cops && G.cops.clear) G.cops.clear(); else A.heat(0);
  await A.teleport(p0[0], p0[1], Math.atan2(p1[0] - p0[0], p1[1] - p0[1]));
  // three seconds parked: lets any slow-mo cooldown from the last run run out
  for (let i = 0; i < 180; i++) A.step(1 / 60);
  const v = G.veh; v.damage = 0;
  const yaw0 = Math.atan2(p1[0] - p0[0], p1[1] - p0[1]);
  v.yaw = yaw0; v.vLong = ${kmh} / 3.6; v.vx = Math.sin(yaw0) * v.vLong; v.vz = Math.cos(yaw0) * v.vLong;
  const f0 = { jump: G.feel.jump, crash: G.feel.crash };
  const out = { kmh: ${kmh}, back: ${back}, takeoffKmh: null, takeoffOffM: null, airS: 0, inAirS: 0, slowmoJump: 0, slowmoCrash: 0, damage: 0, offAtLipM: null, maxOffM: 0, stall: false };
  let flying = false, t = 0;
  const S = Math.sin(j.yaw), C = Math.cos(j.yaw);
  for (let i = 0; i < 60 * 9; i++) {
    const w = (v.x - j.x) * S + (v.z - j.z) * C;
    const n = sNear(v.x, v.z);
    if (w < 0) out.maxOffM = Math.max(out.maxOffM, n.d);
    if (out.offAtLipM == null && w > -1) out.offAtLipM = +n.d.toFixed(2);
    const air = (v.airT || 0) > 0;
    if (!air) {
      const tg = at(n.s + 20), err = Math.atan2(Math.sin(Math.atan2(tg[0] - v.x, tg[1] - v.z) - v.yaw), Math.cos(Math.atan2(tg[0] - v.x, tg[1] - v.z) - v.yaw));
      hold('KeyA', err > 0.03); hold('KeyD', err < -0.03);
      hold('KeyW', (v.speedKmh || 0) < ${kmh});
    } else { hold('KeyA', false); hold('KeyD', false); }
    A.step(1 / 60); t += 1 / 60;
    if ((v.airT || 0) > 0 && !flying) { flying = true; out.takeoffKmh = +(v.speedKmh || 0).toFixed(1); out.takeoffOffM = +((v.x - j.x) * S + (v.z - j.z) * C).toFixed(1); }
    out.inAirS = Math.max(out.inAirS, G.airT || 0);
    if (flying && !((v.airT || 0) > 0)) { flying = false; if (Math.abs(out.takeoffOffM) < 16) { out.airS = +(v.lastAir || 0).toFixed(2); break; } }
  }
  for (const k of Object.keys(held)) hold(k, false);
  out.inAirS = +out.inAirS.toFixed(2); out.maxOffM = +out.maxOffM.toFixed(2);
  out.slowmoJump = G.feel.jump - f0.jump; out.slowmoCrash = G.feel.crash - f0.crash; out.damage = +(v.damage || 0).toFixed(1);
  return out;
})()`;

// Two stills of the ramp as a westbound driver meets it, 70 m and 30 m short of the lip.
async function look(page) {
  for (const d of [70, 30]) {
    await page.evaluate(`(async () => { const A = window.AYLMER, J = await import('/src/game/jumps.js');
      const j = J.JUMPS.find((x) => x.id === 'garnotte'), S = Math.sin(j.yaw), C = Math.cos(j.yaw);
      await A.teleport(j.x - S * ${d}, j.z - C * ${d}, j.yaw); for (let i = 0; i < 40; i++) A.step(1 / 60); return true; })()`);
    await page.sleep(800);
    await page.shot(`B-04-ramp-${d}m`);
  }
}

// The height the game's own physics reads along the ramp axis, for holding
// against the node bake (smoke_firstminute), and three axis flights.
async function probe(page) {
  return page.evaluate(`(async () => { const A = window.AYLMER, G = A.G, J = await import('/src/game/jumps.js');
    const j = J.JUMPS.find((x) => x.id === 'garnotte'), S = Math.sin(j.yaw), C = Math.cos(j.yaw);
    const g = G.phys && G.phys.groundAt, out = [];
    for (let w = -10; w <= 20; w++) { const r = g ? g(j.x + S * w, j.z + C * w) : null; out.push([w, r ? +r.h.toFixed(2) : null]); }
    return { hasPhys: !!g, prof: j.prof || null, h: out };
  })()`);
}

export async function run(page, assert) {
  if (page.beat && page.beat.probe) { const p = await probe(page); assert(p.hasPhys, 'G.phys.groundAt is there'); return p; }
  const before = await page.carState();
  await page.setCar({ damage: 0, vehicle: 'ranger' });
  const geo = await page.evaluate(GEO);
  assert(geo.lipToRouteM <= 1.5, `the lip is on the GPS line: ${geo.lipToRouteM} m from it (bar 1.5)`);
  await look(page);
  const flights = [];
  for (const kmh of [60, 65, 70]) {
    await page.setCar({ damage: 0, vehicle: 'ranger' });
    const f = await page.evaluate(FLY(kmh, 55));
    flights.push(f);
    assert(f.takeoffKmh != null && Math.abs(f.takeoffOffM) < 16, `${kmh} km/h on the line: it takes off off the ramp (${f.takeoffKmh} km/h, ${f.takeoffOffM} m from the lip)`);
    assert(f.maxOffM <= 3, `${kmh} km/h: the truck stays on the line to the lip (${f.maxOffM} m off at worst)`);
    assert(f.airS >= 1.6, `${kmh} km/h: ${f.airS} s of air (bar 1.6, SLOWMO.jumpAir)`);
    assert(f.slowmoJump >= 1, `${kmh} km/h: the jump slow-mo fires (${f.slowmoJump}; crash slow-mo ${f.slowmoCrash})`);
    assert(f.slowmoCrash === 0, `${kmh} km/h: the climb is not a crash (${f.slowmoCrash} crash slow-mo, ${f.damage} damage)`);
  }
  await page.setCar({ damage: before.damage, money: before.money, vehicle: before.vehicle, parked: before.parked });
  return { geo, flights };
}
