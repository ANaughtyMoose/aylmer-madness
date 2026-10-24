// S3-RANGER probe: the numbers the report quotes (0-100, slip/skid at the lever, steering).
//   node tools/probe_ranger.mjs [--bare]
const { carById, Vehicle } = await import('../src/game/cars.js');
const { doughnutAssist } = await import('../src/game/stunts.js');
const bare = process.argv.includes('--bare');
const base = carById('ranger');
const spec = bare ? Object.assign(Object.create(base), { feel: undefined }) : base;
const bounds = { minX: -9e4, maxX: 9e4, minZ: -9e4, maxZ: 9e4 };
const road = { roadAt: () => true, waterAt: () => false, querySegments: () => [], bounds };
const C = (o) => ({ steer: 0, throttle: 0, brake: 0, handbrake: false, ...o });
const DT = 1 / 60;
const out = {};
{ // flat-out pull
  const v = new Vehicle(spec); v.reset(0, 0, 0);
  const marks = {}; let gears = [];
  for (let i = 0; i < 60 * 90; i++) {
    v.update(DT, C({ throttle: 1 }), road);
    for (const k of [50, 80, 100, 116, 130, 140]) if (marks[k] == null && v.speedKmh >= k) marks[k] = { t: +((i + 1) / 60).toFixed(2), m: Math.round(v.z) };
    if (v.box && gears[gears.length - 1] !== v.box.gear) gears.push(v.box.gear);
  }
  out.pull = { marks, top90s: +v.speedKmh.toFixed(1), gears: gears.join('') };
}
{ // handbrake turn at 50 km/h, full lock, assist on (as in game)
  const v = new Vehicle(spec); v.reset(0, 0, 0); v.vz = 50 / 3.6; v.syncFrame();
  let maxSlip = 0, maxSkid = 0, skidSum = 0, n = 0;
  for (let i = 0; i < 60; i++) {
    v.update(DT, C({ steer: 1, handbrake: true }), road);
    maxSlip = Math.max(maxSlip, Math.abs(v.vLat)); maxSkid = Math.max(maxSkid, v.skid);
    skidSum += v.squeal ?? v.skid; n++;
  }
  out.lever50 = { maxSlip: +maxSlip.toFixed(2), maxSkid: +maxSkid.toFixed(3), squealMean: +(skidSum / n).toFixed(3), yaw: +Math.abs(v.yaw).toFixed(2) };
}
{ // the doughnut (B-05's lever slide): from rest, W + full lock + lever with the
  // Sayyad stage's assist, as smoke_doughnut drives it; steady state 3-6 s
  const v = new Vehicle(spec); v.reset(0, 0, 0);
  let slip = 0, skid = 0, sq = 0, kmh = 0, n = 0, smoke = 0;
  for (let i = 0; i < 360; i++) {
    const c = C({ steer: 1, throttle: 1, handbrake: true });
    v.update(DT, c, road);
    doughnutAssist(v, c, DT);
    if (i >= 180) { slip += Math.abs(v.vLat); skid += v.skid; sq += v.squeal ?? v.skid; kmh += Math.hypot(v.vLong, v.vLat) * 3.6; n++; if ((v.squeal ?? v.skid) >= (v.squeal != null ? 0.30 : 0.30)) smoke++; }
  }
  out.doughnut = { slip: +(slip / n).toFixed(2), skid: +(skid / n).toFixed(3), squeal: +(sq / n).toFixed(3), kmh: +(kmh / n).toFixed(1), smokeFrames: `${smoke}/${n}` };
}
{ // an ordinary bend: half lock at 50 km/h, part throttle, 2 s
  const v = new Vehicle(spec); v.reset(0, 0, 0); v.vz = 50 / 3.6; v.syncFrame();
  let maxSlip = 0, maxSq = 0;
  for (let i = 0; i < 120; i++) { v.update(DT, C({ steer: 0.5, throttle: 0.5 }), road); maxSlip = Math.max(maxSlip, Math.abs(v.vLat)); maxSq = Math.max(maxSq, v.squeal ?? v.skid); }
  out.bend50 = { maxSlip: +maxSlip.toFixed(2), maxSqueal: +maxSq.toFixed(3) };
}
{ // plain hard corner, no lever, full lock at 60 km/h held 2 s with throttle
  const v = new Vehicle(spec); v.reset(0, 0, 0); v.vz = 60 / 3.6; v.syncFrame();
  let maxSlip = 0, maxSq = 0, maxRoll = 0;
  for (let i = 0; i < 120; i++) {
    v.update(DT, C({ steer: 1, throttle: 1 }), road);
    maxSlip = Math.max(maxSlip, Math.abs(v.vLat)); maxSq = Math.max(maxSq, v.squeal ?? v.skid); maxRoll = Math.max(maxRoll, Math.abs(v.roll));
  }
  out.corner60 = { maxSlip: +maxSlip.toFixed(2), maxSqueal: +maxSq.toFixed(3), maxRollDeg: +(maxRoll * 57.3).toFixed(2) };
}
{ // keyboard steering: tap response at 80 km/h. Input ramp as core/input.js: 4.2/s away, 7.5/s back.
  const v = new Vehicle(spec); v.reset(0, 0, 0); v.vz = 80 / 3.6; v.syncFrame();
  let s = 0; const yaw0 = v.yaw; let t90 = null, peakRate = 0, settle = null;
  for (let i = 0; i < 180; i++) {
    const held = i < 30;               // 0.5 s key press
    s = held ? Math.min(1, s + 4.2 * DT) : Math.max(0, s - 7.5 * DT);
    v.update(DT, C({ steer: s, throttle: 0.6 }), road);
    peakRate = Math.max(peakRate, Math.abs(v.yawRate));
    if (!held && settle == null && Math.abs(v.yawRate) < 0.02) settle = +((i + 1) / 60 - 0.5).toFixed(2);
  }
  out.tap80 = { heading: +((v.yaw - yaw0) * 57.3).toFixed(1), peakYawRate: +peakRate.toFixed(3), straightAfterRelease: settle };
}
console.log(JSON.stringify({ car: bare ? 'ranger (no feel row)' : 'ranger', ...out }, null, 1));
