#!/usr/bin/env node
// A-04 HUD check. Two halves:
//
//  1. unit: the pure rules in src/game/hud.js and ui.js (one toast at a time,
//     2.5 s floor, the upcoming clock, the centre ranking, the handbrake tip).
//     No browser; `--unit` stops here.
//  2. live: boot index.html, start each job of the pack, and sample the HUD at
//     fixed moments while the truck drives. Every visible HUD box is measured;
//     a pair of boxes that intersect is an overlap. Also: at most two centre
//     text layers in any sample, and the clock visible from the first drive
//     frame on the jobs that have a deadline.
//
//  B-06 adds: the slots (style readout, wrong-vehicle chip) are boxes too;
//  every #reactstats on the page is a box (a stale second one overlaps the
//  live one); the top-left holds at most 2 text lines once the sub line is
//  5 s old; the « Tab » map chip never shows after 2 min at the wheel.
//
//   node tools/qa/hud-overlap.mjs [--unit] [--jobs=a,b,c] [--samples=40]
//
// Own server (CMP_SRV_PORT) and own headless Chrome (CMP_CDP_PORT) with a
// throwaway profile, both closed on exit (tools/qa/lib/rig.mjs).
import { arg, done } from './lib/rig.mjs';

let fails = 0;
const ok = (c, what) => { if (!c) { fails++; console.log('FAIL ' + what); } else console.log('ok   ' + what); };

// ---------------------------------------------------------------- 1. unit
{
  const { ToastQueue, TOAST_MIN_MS, upcomingDeadline, centreKeep, CENTRE_MAX } = await import('../../src/game/hud.js');
  const q = new ToastQueue(1, { minMs: TOAST_MIN_MS });
  q.push('un', 800); q.push('deux', 800); q.step(0);
  ok(q.texts().length === 1 && q.texts()[0] === 'un', 'one toast on screen at a time');
  ok(q.nextDeadline(0) === TOAST_MIN_MS, 'a short toast still gets the 2.5 s floor');
  q.step(TOAST_MIN_MS - 1); ok(q.texts()[0] === 'un', 'still up just before 2.5 s');
  q.step(TOAST_MIN_MS); ok(q.texts()[0] === 'deux', 'the next one follows at 2.5 s');
  q.push('deux', 800); q.push('trois', 4000); q.push('trois', 4000);
  ok(q.pending.length === 1, 'a line already queued or showing is not queued twice');
  q.hold(true, 'yield'); q.hold(true); q.hold(false);
  ok(q.held, 'a yield hold survives the modal hold letting go');
  q.hold(false, 'yield'); ok(!q.held, 'and lets go on its own');

  const stages = [{ text: 'grille' }, { text: 'run', time: 60 }, { text: 'fin', time: 30 }];
  ok(upcomingDeadline({ mission: { stages, idx: 0 }, scale: 1 }) === 60, 'untimed grid shows the next stage budget');
  ok(upcomingDeadline({ mission: { stages, idx: 0 }, scale: 1.5 }) === 90, 'scaled like applyStage');
  ok(upcomingDeadline({ mission: { stages, idx: 2 }, scale: 1 }) === null, 'nothing after the last stage');
  ok(upcomingDeadline({ mission: { stages: [{}, {}], idx: 0 } }) === null, 'an untimed job shows no clock');
  ok(upcomingDeadline({ mission: { stages, idx: 0, failed: true } }) === null, 'a failed job shows no clock');
  ok(upcomingDeadline(null) === null, 'free roam shows no clock');

  const k = centreKeep(['tuto', 'heckles', 'toast', 'prompt']);
  ok(k.size === CENTRE_MAX && k.has('prompt') && k.has('toast'), 'prompt and toast beat chatter and the tip');
  const k2 = centreKeep(['story', 'toast', 'prompt']);
  ok(k2.has('prompt') && k2.has('story') && !k2.has('toast'), 'a story bubble beats a toast');
  ok(centreKeep(['tuto']).has('tuto'), 'a lone tip shows');

  // The handbrake tip: hidden while crawling, clears without a pull.
  const ui = await import('../../src/game/ui.js');
  const tut = new ui.Tutorial();
  tut.finished = false; tut.wait = 0;
  const base = { speedKmh: 20, steer: 0, brake: 0, handbrake: false, mapOpened: false, jobTaken: false };
  // Walk to the handbrake step.
  tut.i = 3;
  tut.update(0.1, { ...base, speedKmh: 2 });
  ok(tut.low === true, 'tip is hidden below 5 km/h');
  for (let i = 0; i < 260; i++) tut.update(0.1, base);
  ok(tut.i >= 4, 'tip lets go after 25 s of driving with no pull');
  tut.i = 3; tut.hold = 0; tut.shown = 0;
  tut.update(0.1, { ...base, speedKmh: 8, handbrake: true });
  ok(tut.hold > 0, 'a pull at 8 km/h clears it');

  // B-06: the pure rules behind the trim and the slots.
  const H = await import('../../src/game/hud.js');
  ok(!H.subFaded({ age: 4900 }) && H.subFaded({ age: 5000 }), 'the sub line fades at 5 s');
  ok(H.subFaded({ age: 200, ticked: true }), '...or once a tutorial chip is ticked after it went up');
  ok(H.tabChipGone({ cap: 'Tab', playtime: 120 }) && !H.tabChipGone({ cap: 'Tab', playtime: 119 }), 'the Tab chip goes at 2 min');
  ok(!H.tabChipGone({ cap: 'E', playtime: 999 }), 'other chips stay');
  const st = (o) => ({ id: 'ranger', current: 'cart', inOwn: false, borrowed: true, jobVehicle: false, at: { x: 0, z: 0 }, dist: 1830, ...o });
  const c1 = H.vehicleChip(st(), 'cart', 'timed');
  ok(!!c1 && c1.warn && /chronométrée/.test(c1.text) && /Y ramène ton Ranger/.test(c1.text), 'cart at a timed pillar: the chip, in red (' + (c1 && c1.text) + ')');
  const c2 = H.vehicleChip(st(), 'cart', null);
  ok(!!c2 && !c2.warn && /1,8 km/.test(c2.text), 'cart off a pillar: the chip with the distance (' + (c2 && c2.text) + ')');
  ok(H.vehicleChip(st(), 'loaner', null) === null, "a friend's car off a pillar: no chip");
  ok(!!H.vehicleChip(st(), 'loaner', 'race'), "a friend's car at a race pillar: the chip");
  ok(H.vehicleChip(st({ jobVehicle: true }), 'cart', 'timed') === null, 'a job that put you in the cart: no chip');
  ok(H.vehicleChip(st({ inOwn: true, borrowed: false }), 'cart', 'timed') === null, 'in your own truck: no chip');
  ok(H.borrowedRole({ id: 'cart', style: 'cart' }) === 'cart' && H.borrowedRole({ twoWheel: true }) === 'bike' && H.borrowedRole({ id: 'civic' }) === 'loaner', 'cart, bike, loaner');
  ok(H.chainView(null) === null && H.chainView({ on: false, events: 0 }) === null, 'no chain, no readout');
  const cv = H.chainView({ on: true, mult: 3, events: 7, fade: 0.5, text: 'STYLE x3' });
  ok(!!cv && cv.text === 'STYLE x3' && cv.mult === 3 && cv.fade === 0.5, 'the readout reads hudState()');
  for (const l of [c1.text, c2.text]) ok(!/[\u2013\u2014]/.test(l), 'no dash in the chip: ' + l);

  // Per-frame cost of the slot reads, in node (indicative): the worst case,
  // in the cart near pillars (ownVehicleStatus + nearestJob + jobKind), every
  // SLOT_MS. The cost per frame is the call cost times the share of frames
  // that do the work.
  const { PLACES } = await import('../../src/game/places.js');
  const P = PLACES.home;
  const G = { veh: { x: P.x, z: P.z, spec: { id: 'cart', style: 'cart' } }, parked: { ranger: { x: P.x + 1500, z: P.z } }, done: new Set(), day: 1, hour: 12, money: 0, mission: null };
  const hud = new H.Hud();
  for (let i = 0; i < 50; i++) hud.setVehicle(G);
  const N = 2000, t0 = performance.now();
  for (let i = 0; i < N; i++) hud.setVehicle(G);
  const per = (performance.now() - t0) / N;
  const perFrame = per * (16.7 / H.SLOT_MS);
  console.log(`     slot read ${(per * 1000).toFixed(1)} µs per call, ${perFrame.toFixed(4)} ms per frame at 60 fps (cap 0.10)`);
  ok(perFrame < 0.10, 'slot reads under the 0.10 ms per-frame cap');
}

if (arg('unit', null) !== null) { console.log(fails ? `hud-overlap unit: ${fails} failed` : 'hud-overlap unit: ok'); done(fails ? 1 : 0); }

// ---------------------------------------------------------------- 2. live
const { startServer, startChrome, Page, boot, CLEAR_SCRIPT, ports, sleep } = await import('./lib/rig.mjs');
const CLOCK_JOBS = ['curfew', 'highwayhull', 'blitz'];
const jobs = String(arg('jobs', 'alternateur,divan,curfew,highwayhull,blitz,gang,racedave,margaretdental,canot'))
  .split(',').map((s) => s.trim()).filter(Boolean);
const samples = Number(arg('samples', 40));
const per = Math.max(1, Math.ceil(samples / jobs.length));
const { srv, cdp } = ports();

// Measured in the page. Text elements use the box of their text, not the
// block, so a short objective line is not counted as 44vw wide.
const MEASURE = `(() => {
  const vis = (el) => { if (!el || !el.isConnected) return false; if (el.closest('.hidden')) return false;
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false;
    for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity < 0.05) return false; }
    return true; };
  const textRect = (el) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect(); };
  const boxes = [];
  const add = (name, el, text) => { if (!vis(el)) return; const r = text ? textRect(el) : el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return; boxes.push({ name, x: r.left, y: r.top, w: r.width, h: r.height }); };
  const $ = (id) => document.getElementById(id);
  if (document.body.classList.contains('modal')) return JSON.stringify({ modal: true, boxes: [], centre: [] });
  add('objective', $('objective'), true); add('sub', $('sub'), true); add('timer', $('timer'), true);
  add('speedo', $('speedo')); add('minimap', $('minimap')); add('street', $('street'), true);
  for (const t of document.querySelectorAll('#toast .toastline.show')) if (t.textContent.trim()) add('toast', t);
  add('prompt', $('prompt')); add('tuto', $('tuto')); add('legend', $('legend')); add('envelope', $('envelope'));
  add('fuel', $('fuel')); add('reactstats', $('reactstats'), true); add('dmgwrap', $('dmgwrap')); add('gear', $('gear'), true);
  add('stars', $('stars'), true); add('repairhint', $('repairhint'), true); add('toothhud', $('toothhud')); add('radio', $('radio'));
  add('stylechain', $('stylechain')); add('vehchip', $('vehchip'));
  const rs = [...document.querySelectorAll('#reactstats')].filter(vis);
  for (let i = 1; i < rs.length; i++) add('reactstats' + i, rs[i], true);
  // Top-left text lines (B-06): every visible HUD text in the top-left box.
  const W = innerWidth, H = innerHeight;
  let tl = 0;
  for (const el of [$('objective'), $('sub')]) {
    if (!vis(el) || !(el.textContent || '').trim()) continue;
    const r = textRect(el); if (r.width < 2 || r.left > W * 0.45 || r.top > H * 0.2) continue;
    const lh = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.2;
    tl += Math.max(1, Math.round(r.height / lh));
  }
  const hud = window.AYLMER.hud, tu = $('tuto'), cap = tu && tu.querySelector('.cap');
  const tab = vis(tu) && cap && cap.textContent.trim() === 'Tab' ? (window.AYLMER.G.playtime || 0) : null;
  for (const b of document.querySelectorAll('#heckles .bub:not(.out)')) add(b.classList.contains('story') ? 'story' : 'heckle', b);
  const CENTRE = ['toast', 'prompt', 'tuto', 'story', 'heckle'];
  return JSON.stringify({ modal: false, boxes, centre: boxes.filter((b) => CENTRE.includes(b.name)).map((b) => b.name),
    // subAge: since the sub line last changed (hud.js B-06), or, on a head
    // without it (the before run), since the job's card closed.
    tl, subAge: hud && hud._subAt != null ? Math.round(performance.now() - hud._subAt) : (window.__hudJobAt ? Math.round(performance.now() - window.__hudJobAt) : null), tab, reactstats: rs.length, subState: $('sub') ? $('sub').className + '/' + getComputedStyle($('sub')).opacity : null,
    timer: vis($('timer')) ? $('timer').textContent : null, kmh: Math.round(window.AYLMER.G.veh.speedKmh || 0) });
})()`;

const overlaps = (boxes) => {
  const out = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (ix > 2 && iy > 2) out.push(`${a.name}x${b.name}`);
  }
  return out;
};

const server = await startServer(srv);
const ch = await startChrome({ gpu: false, port: cdp });
const page = await Page.open(cdp);
const rows = [];
const clockMiss = [];
let total = 0, bad = 0, crowd = 0, tlOld = 0, tlBad = 0, tabLate = 0;
try {
  await boot(page, `http://127.0.0.1:${srv}/index.html?review=hud`, { timeoutS: 900 });
  await page.eval(CLEAR_SCRIPT, 300000);
  for (const id of jobs) {
    // Start the job, read its card through the way a player does (cinema.finish
    // is what Enter does), then drive with W and sample.
    const started = await page.eval(`(async () => {
      const A = window.AYLMER, G = A.G;
      if (G.mission && A.abandon) A.abandon();
      G.veh.damage = 0;
      // The pack is played out of story order, so most jobs are locked (the
      // hour, the job that comes first). A copy of the def under a new id is
      // not a campaign job and has no lock; its stages, clocks and card are
      // the real ones, which is all the HUD sees.
      const M = await import('/src/game/missions.js');
      let def = M.ALL_MISSIONS.find((d) => d.id === ${JSON.stringify(id)});
      if (!def) return JSON.stringify({ r: false, err: 'no such job' });
      if (!M.missionAvailable(G, def)) def = { ...def, id: def.id + '_hudcheck' };
      // Start from the giver's spot like a player would. The truck spawns at
      // home, and a job whose goal is home (curfew) would finish on frame one.
      try { const P = (await import('/src/game/places.js')).PLACES[def.giver]; if (P && A.teleport) await A.teleport(P.x + 6, P.z + 6, 0); } catch {}
      let r; try { r = A.start(def); } catch (e) { return JSON.stringify({ r: false, err: 'start threw: ' + e.message }); }
      if (r === false) return JSON.stringify({ r: false, err: (document.querySelector('#toast')?.innerText || '').trim() || 'refused' });
      for (let i = 0; i < 60; i++) {
        if (A.cinema.active) A.cinema.finish();
        const s = document.getElementById('story'); if (s && !s.classList.contains('hidden') && A.story?.hide) A.story.hide();
        await new Promise((res) => setTimeout(res, 100));
        if (!A.cinema.active && !document.body.classList.contains('modal') && i > 3) break;
      }
      A.pause && A.pause(false);
      window.__hudJobAt = performance.now();
      return JSON.stringify({ r: r !== false, mission: G.mission ? G.mission.def.id : null, err: G.mission ? '' : 'closed during the card: ' + ((document.querySelector('#toast')?.innerText || '').trim()) });
    })()`, 120000).then(JSON.parse).catch((e) => ({ r: false, err: e.message }));
    if (!started.mission) { console.log(`skip ${id}: did not start (${started.err || ''})`); if (CLOCK_JOBS.includes(id)) clockMiss.push(id + ' (did not start)'); continue; }
    await sleep(150);
    const first = JSON.parse(await page.eval(MEASURE, 60000));
    if (CLOCK_JOBS.includes(id)) {
      const seen = first.timer != null;
      ok(seen, `${id}: clock visible on the first drive frame (${first.timer ?? 'none'})`);
      if (!seen) clockMiss.push(id);
    }
    await page.eval(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true })); 'ok'`);
    for (let n = 0; n < per; n++) {
      await sleep(n === 0 ? 300 : 1800);
      const s = JSON.parse(await page.eval(MEASURE, 60000));
      if (s.modal) { await page.eval(`(() => { const A = window.AYLMER; if (A.cinema.active) A.cinema.finish(); return 1; })()`); continue; }
      const ov = overlaps(s.boxes);
      total++;
      if (ov.length) bad++;
      if (s.centre.length > 2) crowd++;
      const old = s.subAge != null && s.subAge >= 5000;
      if (old) { tlOld++; if (s.tl > 2) tlBad++; }
      if (s.tab != null && s.tab >= 120) tabLate++;
      rows.push({ id, n, kmh: s.kmh, overlaps: ov, centre: s.centre, tl: s.tl, subAge: s.subAge });
      const badRow = ov.length || s.centre.length > 2 || (old && s.tl > 2) || (s.tab != null && s.tab >= 120);
      console.log(`${badRow ? 'BAD ' : 'ok  '} ${id} #${n} ${s.kmh} km/h centre=[${s.centre.join(',')}] topleft=${s.tl}${old ? '' : ' (sub ' + s.subAge + ' ms)'}${s.tab != null ? ' tab@' + Math.round(s.tab) + 's' : ''}${old && s.tl > 2 ? ' sub=' + s.subState : ''}${ov.length ? ' overlaps=' + ov.join(' ') : ''}`);
    }
    await page.eval(`window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w', bubbles: true })); 'ok'`);
  }
} catch (e) { fails++; console.log('FAIL harness: ' + e.message); }
const errs = page.errors.filter((e) => !/favicon/i.test(e));
await page.close(); await ch.stop(); await server.stop();

ok(total >= Math.min(samples, jobs.length), `sampled ${total} frames`);
ok(bad === 0, `0 frames with overlapping HUD boxes (${bad} of ${total})`);
ok(crowd === 0, `at most 2 centre text layers (${crowd} frames over)`);
ok(tlOld > 0 && tlBad === 0, `at most 2 top-left text lines once the sub is 5 s old (${tlBad} of ${tlOld} over)`);
ok(tabLate === 0, `no Tab chip after 2 min at the wheel (${tabLate} frames)`);
ok(clockMiss.length === 0 && jobs.some((j) => CLOCK_JOBS.includes(j)) && total > 0, `clock from t=0 on ${CLOCK_JOBS.join(', ')}`);
if (errs.length) console.log('console errors (not counted here, boot.mjs gates them):\n  ' + errs.slice(0, 6).join('\n  '));
console.log(JSON.stringify({ hudOverlap: { frames: total, overlapFrames: bad, crowdedFrames: crowd, clockMiss, topLeftOld: tlOld, topLeftOver: tlBad, tabLate } }));
console.log(fails ? `hud-overlap: ${fails} failed` : 'hud-overlap: ok');
done(fails ? 1 : 0);
