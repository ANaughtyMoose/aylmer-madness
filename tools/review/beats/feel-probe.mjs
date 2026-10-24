// Red-team feel probe (19 Oct 2026). Read-only on the game: measures what the
// driving feels like in numbers and frames. Run as { "do": "script", "id": "feel-probe" }.
// S3-BOT (20 Oct): in full.json and quick.json after the crash beat. It repairs
// and moves the truck, so the damage, money and car it found are put back at
// the end and the next beat still carries what the beat before left.
export async function run(page, assert) {
  const carried = await page.carState();
  try { return await probe(page, assert); }
  finally { await page.setCar(carried).catch(() => {}); }
}

async function probe(page, assert) {
  const ev = async (js) => JSON.parse(await page.evaluate(`(async () => JSON.stringify(await (async () => { ${js} })()))()`));
  const out = {};
  // C (camera) is not a key the harness's real-key table knows: the same synthetic key the bot uses.
  const camKey = () => page.evaluate('window.__fp.tap("KeyC")');
  await ev(`window.__fp = {
    key(code, down) { const key = code.startsWith('Key') ? code.slice(3).toLowerCase() : code === 'Space' ? ' ' : code;
      window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key, bubbles: true, cancelable: true })); },
    tap(code) { this.key(code, true); setTimeout(() => this.key(code, false), 60); },
    rel() { for (const k of ['KeyW','KeyS','KeyA','KeyD','Space']) this.key(k, false); },
    steps(n) { for (let i = 0; i < n; i++) window.AYLMER.step(1 / 60); },
    uncard() { const C = window.AYLMER.cinema; for (let i = 0; i < 4 && C && C.active; i++) C.finish(); },
    async straight() { const A = window.AYLMER, P = (await import('/src/game/places.js')).PLACES;
      const pairs = [['home', 'mall'], ['beach', 'ctire'], ['principale', 'deschenes'], ['home', 'marina']];
      let best = null;
      for (const [a, b] of pairs) { if (!P[a] || !P[b] || !A.G.nav) continue;
        const r = A.G.nav.route(P[a].x, P[a].z, P[b].x, P[b].z); if (!r) continue;
        let s = 0, len = 0, h0 = null;
        for (let i = 0; i + 1 < r.length; i++) { const dx = r[i+1][0]-r[i][0], dz = r[i+1][1]-r[i][1], L = Math.hypot(dx, dz), h = Math.atan2(dx, dz);
          let dh = h0 == null ? 0 : Math.abs(((h - h0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
          if (h0 != null && dh > 0.12) { s = i; len = 0; }
          h0 = h; len += L;
          if (!best || len > best.len) best = { len, p: r[s], h: Math.atan2(r[s+1][0]-r[s][0], r[s+1][1]-r[s][1]) }; } }
      if (!best) return 0;
      await A.teleport(best.p[0], best.p[1], best.h); for (let i = 0; i < 100 && A.G.seamHold; i++) await new Promise((r) => setTimeout(r, 100));
      return Math.round(best.len); },
    setSpeed(kmh) { const v = window.AYLMER.G.veh, s = kmh / 3.6; v.vLong = s; v.vLat = 0; v.vx = Math.sin(v.yaw) * s; v.vz = Math.cos(v.yaw) * s; },
    inFrame(x, z) { const G = window.AYLMER.G; const cx = G.camPos[0], cz = G.camPos[2];
      const dx = x - cx, dz = z - cz, d = Math.hypot(dx, dz); const a = Math.atan2(dx, dz) - G.camYaw;
      const w = Math.atan2(Math.sin(a), Math.cos(a)); const hfov = Math.atan(Math.tan((G.q.fov + (G.feel.speedFov||0)) / 2) * 1.6);
      return { d: Math.round(d), inFrame: Math.abs(w) < hfov && d < 220 }; },
  }; return 1;`);

  // ---- A. acceleration, top speed, braking (stepped, deterministic) ----
  out.accel = await ev(`const A = window.AYLMER, G = A.G, F = window.__fp; F.uncard(); if (G.mission) A.abandon();
    const straightM = await F.straight(); F.steps(30); G.veh.repair && G.veh.repair();
    F.setSpeed(0); const v = G.veh; const t = {}; let max = 0, x0 = v.x, z0 = v.z, gear = [];
    F.key('KeyW', true);
    // S3-BOT: 45 s flat out ran off the end of the straight into a wall (kmhAt45s 1.3,
    // so the 80-0 stop measured nothing): stop at 4 s past 100 km/h or 35 s, or 150 m short of the straight's end.
    for (let i = 0; i < 60 * 35; i++) { if (t[100] != null && i / 60 > t[100] + 4) break; if (Math.hypot(v.x - x0, v.z - z0) > straightM - 150) break;
      A.step(1/60); const k = v.speedKmh; max = Math.max(max, k);
      for (const m of [30, 50, 80, 100]) if (t[m] == null && k >= m) t[m] = +(i/60).toFixed(2);
      if (v.box && gear[gear.length-1] !== v.box.gear) gear.push(v.box.gear); }
    F.rel(); const kAt = v.speedKmh; const xb = v.x, zb = v.z;
    F.key('KeyS', true); let n = 0; for (; n < 60 * 15 && Math.abs(v.vLong) > 0.3; n++) A.step(1/60); F.rel();
    return { straightM, t30: t[30], t50: t[50], t80: t[80], t100: t[100], maxKmh: +max.toFixed(1), kmhAtLift: +kAt.toFixed(1), liftM: +Math.hypot(xb - x0, zb - z0).toFixed(0), gears: gear,
      brakeFromKmh: +kAt.toFixed(1), brakeSecs: +(n/60).toFixed(2), brakeM: +Math.hypot(v.x - xb, v.z - zb).toFixed(1), spec: { top: G.veh.spec.topSpeed, accel: G.veh.spec.accel, brake: G.veh.spec.brake, grip: G.veh.spec.grip, steerMax: G.veh.spec.steerMax, feel: !!G.veh.spec.feel } };`);
  page.say(`  feel accel: ${JSON.stringify(out.accel)}`);

  // ---- B. steering response at 60 and 100 km/h ----
  out.steer = {};
  for (const kmh of [60, 100]) {
    out.steer[kmh] = await ev(`const A = window.AYLMER, G = A.G, F = window.__fp; await F.straight(); F.steps(10);
      const v = G.veh; F.setSpeed(${kmh}); const yaw0 = v.yaw; let yr = [], lat = 0, roll = 0, skid = 0;
      F.key('KeyD', true); F.key('KeyW', true);
      for (let i = 0; i < 72; i++) { A.step(1/60); yr.push(+Math.abs(v.yawRate).toFixed(3)); lat = Math.max(lat, Math.abs(v.vLat)); roll = Math.max(roll, Math.abs(v.roll)); skid = Math.max(skid, v.skid); }
      const dYaw = Math.abs(v.yaw - yaw0) * 180 / Math.PI; const peak = Math.max(...yr); const t90 = yr.findIndex((y) => y >= 0.9 * peak);
      F.key('KeyD', false); let n = 0; for (; n < 180 && Math.abs(v.vLat) > 0.3; n++) A.step(1/60); F.rel();
      return { degAfter1_2s: +dYaw.toFixed(1), peakYawRateDegS: +(peak*180/Math.PI).toFixed(1), t90ms: Math.round(t90 * 1000 / 60), maxSlipMs: +lat.toFixed(2), maxRoll: +roll.toFixed(3), maxSkid: +skid.toFixed(2), settleMs: Math.round(n * 1000 / 60), kmhAfter: +v.speedKmh.toFixed(1), steerLock: +v.steer.toFixed(3) };`);
    page.say(`  feel steer ${kmh}: ${JSON.stringify(out.steer[kmh])}`);
  }

  // ---- C. handbrake 180 at 50 km/h, Ranger ----
  out.handbrake = await ev(`const A = window.AYLMER, G = A.G, F = window.__fp; await F.straight(); F.steps(10);
    const v = G.veh; F.setSpeed(50); const yaw0 = v.yaw, x0 = v.x, z0 = v.z; let t180 = null, maxSkid = 0, maxSlip = 0;
    F.key('KeyD', true); F.key('Space', true);
    for (let i = 0; i < 300 && t180 == null; i++) { A.step(1/60); maxSkid = Math.max(maxSkid, v.skid); maxSlip = Math.max(maxSlip, Math.abs(v.vLat));
      let d = Math.abs(v.yaw - yaw0); if (d >= Math.PI) t180 = +(i/60).toFixed(2); }
    F.rel(); return { t180, spanM: +Math.hypot(v.x - x0, v.z - z0).toFixed(1), maxSkid: +maxSkid.toFixed(2), maxSlipMs: +maxSlip.toFixed(1), kmhEnd: +v.speedKmh.toFixed(1), hb: { grip: v.spec.hbGrip, yaw: v.spec.hbYaw, swing: v.spec.hbSwing } };`);
  page.say(`  feel handbrake: ${JSON.stringify(out.handbrake)}`);

  // ---- G. traffic in frame at speed, real loop, with frames ----
  await ev(`const F = window.__fp; await F.straight(); F.steps(10); window.__fpTraffic = []; return 1;`);
  await page.evaluate(`window.__RV.run({ type: 'floor', seconds: 14, steer: 0 })`);
  const samples = [];
  for (let i = 0; i < 26; i++) {
    await page.sleep(500);
    samples.push(await ev(`const A = window.AYLMER, G = A.G, F = window.__fp; const v = G.veh; const cars = (G.traffic && G.traffic.cars) || [];
      let inFrame = 0, within60Ahead = 0, within150 = 0; const fx = Math.sin(v.yaw), fz = Math.cos(v.yaw);
      for (const c of cars) { const d = Math.hypot(c.x - v.x, c.z - v.z); if (d < 150) within150++;
        const ahead = (c.x - v.x) * fx + (c.z - v.z) * fz; if (ahead > 0 && ahead < 60 && Math.abs((c.x - v.x) * fz - (c.z - v.z) * fx) < 12) within60Ahead++;
        if (F.inFrame(c.x, c.z).inFrame) inFrame++; }
      return { kmh: +v.speedKmh.toFixed(0), inFrame, within60Ahead, within150, cars: cars.length, fov: +((G.q.fov + G.feel.speedFov) ).toFixed(3), speedFov: +(G.feel.speedFov||0).toFixed(3), wind: G.feel && A.feel().wind };`));
    if (i === 18) { await page.sequence('feel-speed', 6, 100); }
  }
  await page.shot('feel-speed-chase');
  out.traffic = { samples, trafficSetting: await page.evaluate('window.AYLMER.G.q.traffic'), quality: await page.evaluate('window.AYLMER.G.settings.quality') };
  page.say(`  feel traffic: ${JSON.stringify(samples.slice(-6))}`);
  // hood cam shot at speed
  await page.evaluate(`window.__RV.run({ type: 'floor', seconds: 6, steer: 0 })`);
  const cam0 = await page.evaluate('window.AYLMER.G.cam');
  await page.sleep(300); await camKey(); await page.sleep(3500);
  out.hoodCam = await page.evaluate('(() => { const G = window.AYLMER.G; return { cam: G.cam, kmh: Math.round(G.veh.speedKmh) }; })()');
  await page.shot('feel-speed-cam2');
  await camKey(); await page.sleep(2500); await page.shot('feel-speed-cam3'); await camKey(); await page.sleep(300);
  out.hoodCam.cam3 = await page.evaluate('window.AYLMER.G.cam');
  await camKey(); await page.sleep(300);
  // Put the camera back where the plan had it (S3-BOT: it was left on preset 4 for every later beat).
  for (let i = 0; i < 8 && (await page.evaluate('window.AYLMER.G.cam')) !== cam0; i++) { await camKey(); await page.sleep(250); }
  out.hoodCam.camBack = await page.evaluate('window.AYLMER.G.cam');
  out.hoodCam.cam0 = cam0;
  assert(out.hoodCam.camBack === cam0, `camera back on the preset it started on (${cam0})`);

  // ---- E. crash at 70 km/h into a Principale frontage, real loop, frames ----
  out.crash = await ev(`const A = window.AYLMER, G = A.G, F = window.__fp; if (G.mission) A.abandon(); F.uncard();
    const PL = (await import('/src/game/places.js')).PLACES; const a = PL.principale, o = PL.marina;
    const r = G.nav.route(a.x, a.z, o.x, o.z); const h = Math.atan2(r[1][0] - r[0][0], r[1][1] - r[0][1]) + Math.PI / 2;
    G.slowmo.cool = 0; G.veh.repair && G.veh.repair();
    await A.teleport(r[0][0] - Math.sin(h) * 25, r[0][1] - Math.cos(h) * 25, h); for (let i = 0; i < 100 && G.seamHold; i++) await new Promise((r) => setTimeout(r, 100));
    F.steps(20); G.feelFx.clear(); G.feelFx.resetTelemetry(); const s0 = { crash: G.feel.crash, props: G.stats.propsSmashed || 0, dmg: G.veh.damage };
    window.__fpCrash0 = s0; F.setSpeed(70); window.__RV.run({ type: 'floor', seconds: 5, steer: 0 }); return s0;`);
  let hit = null; const t0 = Date.now();
  for (let i = 0; i < 120 && !hit; i++) {
    await page.sleep(40);
    const s = await ev(`const G = window.AYLMER.G; return { dmg: G.veh.damage, impact: G.veh.impact, kmh: G.veh.speedKmh, slow: G.slowmo.left, scale: G.slowmo.scale, kind: G.slowmo.kind, stop: G.feelFx.hitstopLeft(), trauma: G.feelFx.trauma() };`);
    if (s.dmg > out.crash.dmg + 0.5) hit = { ...s, atMs: Date.now() - t0 };
  }
  const seq = hit ? await page.sequence('feel-crash', 10, 60) : null;
  await page.sleep(1500);
  out.crash.after = await ev(`const A = window.AYLMER, G = A.G, v = G.veh; const d = G.debris; let live = 0; try { for (const b of (d && d.bodies) || []) if (b.live) live++; } catch {}
    return { hit: ${JSON.stringify(hit)}, damageAfter: +v.damage.toFixed(1), deformF: +v.deformF.toFixed(2), deformR: +v.deformR.toFixed(2), headOut: v.headOut, steam: +v.steamT.toFixed(2), kmh: +v.speedKmh.toFixed(1),
      slowmoCount: G.feel.crash - window.__fpCrash0.crash, tel: G.feelFx.telemetry(), camPunchMax: G.camPunch, debrisLive: live, yawSpin: +v.yawSpin.toFixed(2), audioCrash: !!A.audio };`);
  page.say(`  feel crash: ${JSON.stringify(out.crash.after).slice(0, 500)}`);
  await page.shot('feel-crash-after');

  // ---- F. cops at 3 stars, real loop: is a cruiser ever on screen? ----
  await ev(`const A = window.AYLMER, G = A.G, F = window.__fp; if (G.mission) A.abandon(); F.uncard(); G.veh.repair && G.veh.repair();
    const PL = (await import('/src/game/places.js')).PLACES; const a = PL.principale, o = PL.marina;
    const r = G.nav.route(a.x, a.z, o.x, o.z); const h = Math.atan2(r[1][0] - r[0][0], r[1][1] - r[0][1]);
    await A.teleport(r[0][0], r[0][1], h); for (let i = 0; i < 100 && G.seamHold; i++) await new Promise((r) => setTimeout(r, 100));
    F.steps(20); A.heat(3); F.steps(5); window.__RV.run({ type: 'drive', to: { x: o.x, z: o.z }, maxKmh: 75, timeout: 32 }); return 1;`);
  const cops = [];
  for (let i = 0; i < 60; i++) {
    await page.sleep(500);
    cops.push(await ev(`const A = window.AYLMER, G = A.G, F = window.__fp, c = G.cops, v = G.veh;
      const us = (c.units || []).map((u) => ({ ...F.inFrame(u.x, u.z), dv: Math.round(Math.hypot(u.x - v.x, u.z - v.z)), kmh: Math.round((u.veh && u.veh.speedKmh) || 0) }));
      const bl = (c.blocks || []).map((b) => ({ ...F.inFrame(b.x, b.z), dv: Math.round(Math.hypot(b.x - v.x, b.z - v.z)) }));
      return { t: ${i} * 0.5, kmh: Math.round(v.speedKmh), stars: Math.floor(c.heat), heat: +c.heat.toFixed(2), units: us, blocks: bl, siren: !!c.sirenOn, busted: c.busted, chasing: c.chasing };`));
    if (i === 10 || i === 24 || i === 44) await page.shot(`feel-cops-t${i / 2}`);
  }
  const anyInFrame = cops.filter((s) => s.units.some((u) => u.inFrame)).length;
  const blockInFrame = cops.filter((s) => s.blocks.some((u) => u.inFrame)).length;
  const nearest = cops.map((s) => Math.min(...s.units.map((u) => u.dv), 9999));
  out.cops = { samplesWithUnitInFrame: anyInFrame, samplesWithBlockInFrame: blockInFrame, of: cops.length, nearestByHalfSec: nearest, unitSpeeds: cops.map((s) => s.units.map((u) => u.kmh)), ownKmh: cops.map((s) => s.kmh), heat: cops.map((s) => s.heat), last: cops[cops.length - 1] };
  page.say(`  feel cops: inFrame ${anyInFrame}/${cops.length}, blocks ${blockInFrame}, nearest ${JSON.stringify(nearest)}`);
  await ev(`window.AYLMER.heat(0); const c = window.AYLMER.G.cops; c.clear && c.clear(); return 1;`);

  // ---- H. the chantier at the speed it was built for ----
  out.jump = await ev(`const A = window.AYLMER, G = A.G, F = window.__fp; const J = (await import('/src/game/jumps.js')); const j = J.JUMPS.find((x) => x.id === 'chantier');
    G.veh.repair && G.veh.repair(); const h = Math.atan2(j.x - j.entry[0], j.z - j.entry[1]);
    await A.teleport(j.entry[0], j.entry[1], h); for (let i = 0; i < 100 && G.seamHold; i++) await new Promise((r) => setTimeout(r, 100)); F.steps(10);
    F.setSpeed(100); G.slowmo.cool = 0; const c0 = G.feel.jump;
    const land = [j.x + Math.sin(j.yaw) * 60, j.z + Math.cos(j.yaw) * 60];
    window.__RV.run({ type: 'aim', points: [[j.x, j.z], land], seconds: 14, from: j.entry }); window.__fpJ = { c0, pred: J.predictAir(j.H / j.run, j.kmh / 3.6, 0) }; return { builtKmh: j.kmh };`);
  let end = null;
  for (let i = 0; i < 60 && !end; i++) { await page.sleep(250); end = (await page.evaluate('JSON.stringify(window.__RV.drain())').then(JSON.parse)).find((e) => e.kind === 'task-end' && e.task === 'aim'); if (!end) { const st = await ev('const G = window.AYLMER.G; return { air: G.veh.inAir, t: G.veh.airT };'); if (st.air && st.t > 0.3 && !out.jump.shot) { out.jump.shot = true; await page.sequence('feel-jump', 8, 120); } } }
  out.jump.end = end; out.jump.more = await ev(`const G = window.AYLMER.G; return { slowmoFired: G.feel.jump - window.__fpJ.c0, predictedAir: +window.__fpJ.pred.toFixed(2), lastAir: +G.veh.lastAir.toFixed(2), damage: +G.veh.damage.toFixed(1), kmh: Math.round(G.veh.speedKmh) };`);
  page.say(`  feel jump: ${JSON.stringify(out.jump)}`);
  await page.shot('feel-jump-landed');
  // The probe's own validity (S3-BOT): each section measured something.
  assert(out.accel.t50 != null && out.accel.brakeFromKmh > 60, `accel: 0-50 timed and the stop is from over 60 km/h (from ${out.accel.brakeFromKmh})`);
  assert(out.steer[60] && out.steer[100], 'steer: both speeds measured');
  assert(!!out.crash.after.hit, 'crash: the 70 km/h run hit something');
  assert(cops.length === 60, 'cops: 60 half-second samples');
  return out;
}
