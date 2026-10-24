// E-09 / S4-SUMMER (20 Oct 2026): « Le dernier soir » played to its end in the
// Ranger, by script. A plan runs it as { "do": "script", "id": "E-09" }.
//
// Each column: the finale seeded (the ten done, the calendar on Labour Day),
// started at 299 Fraser, then a drive through `tour` (place keys) with the
// bot's own drive task (no teleport, no assist), each callback let land, home,
// the phone and the brochure by the mission task (attach, no tour), then every
// card read and shot: the three end cards and the summer-end screen. Asserts
// are named `<col> ...`. Beat options: tour (default tyler, tims, ctire),
// legSecs (300), columns (['played'], or ['played', 'fresh']), carryDamage (24:
// the most a job inherits without the job-start patch wiping it).
const TOUR = ['tyler', 'tims', 'ctire'];

const RESET_JS = `(() => { const G = window.AYLMER.G; G.summerOver = false; G.lastNight = false;
  if (G.stats) G.stats.ending = null; G.done.delete('arcdernier'); return true; })()`;

export async function run(page, assert) {
  const b = page.beat || {};
  const tour = b.tour || TOUR, legSecs = b.legSecs || 300;
  const cols = b.columns || ['played'];
  const before = await page.carState();
  const out = {};
  for (const col of cols) {
    await page.evaluate(RESET_JS);
    out[col] = await column(page, assert, col, { damage: col === 'fresh' ? 0 : (b.carryDamage ?? 24), money: before.money, done: before.done, vehicle: 'ranger' }, tour, legSecs);
  }
  return { tour, columns: out };
}

async function column(page, assert, col, car, tour, legSecs) {
  const t0 = Date.now();
  await page.setCar(car);
  const seed = await page.seedFor('arcdernier');
  assert(seed && seed.ok && seed.available, `${col} start: the finale is open after the ten (${seed && seed.lock})`);
  await page.sleep(1200);
  const start = await page.evaluate(`(() => { const A = window.AYLMER, G = A.G; const ok = A.start('arcdernier');
    window.__E09 = { heatMax: 0, texts0: window.__RV.texts.length };
    window.__E09.t = setInterval(() => { const h = G.cops && (G.cops.heat || G.cops.stars || 0); if (h > window.__E09.heatMax) window.__E09.heatMax = h; }, 100);
    return { ok: ok !== false, id: G.mission && G.mission.def.id, idx: G.mission ? G.mission.idx : -1, damage: G.veh.damage || 0,
      day: G.day, money: Math.round(G.wallet.value), payScale: G.payScale || 1 }; })()`);
  // The brief card, if any.
  for (let i = 0; i < 4 && (await page.evaluate('window.__RV.cardUp()')); i++) { await page.shot(`e09-${col}-brief-${i}`); await page.tap('Enter'); await page.sleep(700); }
  assert(start.ok && start.id === 'arcdernier' && start.idx === 0, `${col} start: arcdernier, stage 1`, start);
  assert(Math.abs(start.damage - car.damage) <= 0.5, `${col} start: damage ${start.damage.toFixed(1)} carried (${car.damage})`);
  assert(start.day >= 75, `${col} start: the calendar is at Labour Day weekend (day ${start.day}), no jump from July`);

  const legs = [];
  for (const k of tour) {
    const to = await page.evaluate(`(async () => { const G = window.AYLMER.G, P = (await import('/src/game/places.js')).PLACES[${JSON.stringify(k)}];
      if (!P) return null; const r = window.__RV.botRoute ? window.__RV.botRoute(G.veh.x, G.veh.z, P.x, P.z) : G.nav.route(G.veh.x, G.veh.z, P.x, P.z);
      const e = r && r.length ? r[r.length - 1] : [P.x, P.z]; return { x: e[0], z: e[1] }; })()`);
    if (!to) { assert(false, `${col} leg ${k}: no such place`); continue; }
    const end = await page.runTask({ type: 'drive', to, r: 12, maxKmh: 60, timeout: legSecs }, `e09-${col}-${k}`, { maxSecs: legSecs + 60, every: 60 });
    await page.sleep(1500);
    const s = await page.evaluate(`(async () => { const G = window.AYLMER.G, P = (await import('/src/game/places.js')).PLACES[${JSON.stringify(k)}];
      return { id: G.mission && G.mission.def.id, seen: G.mission && G.mission.fin ? [...G.mission.fin.seen] : [], d: Math.round(Math.hypot(G.veh.x - P.x, G.veh.z - P.z)),
        objective: (document.getElementById('objective') || {}).innerText || '' }; })()`);
    await page.shot(`e09-${col}-at-${k}`);
    legs.push({ k, outcome: end.outcome, secs: end.elapsed, d: s.d, vehicle: end.bot && end.bot.vehicle });
    assert(s.id === 'arcdernier', `${col} leg ${k}: still in the finale`);
    assert(s.seen.includes(k), `${col} leg ${k}: the callback landed (${s.d} m)`, s.seen);
    assert(end.bot && end.bot.vehicle === 'ranger', `${col} leg ${k}: in the Ranger (${end.bot && end.bot.vehicle})`);
  }
  const counted = await page.evaluate(`(document.getElementById('objective') || {}).innerText || ''`);
  assert(new RegExp(`${tour.length}/\\d+ places de l`).test(counted), `${col}: the objective counts the places (${counted.replace(/\s+/g, ' ').slice(0, 80)})`);

  // Home, then the phone and the brochure, played by the mission task (no tour, no teleport).
  const home = await page.evaluate(`(async () => { const G = window.AYLMER.G, P = (await import('/src/game/places.js')).PLACES.home;
    const r = G.nav.route(G.veh.x, G.veh.z, P.x, P.z); const e = r && r.length ? r[r.length - 1] : [P.x, P.z]; return { x: e[0], z: e[1] }; })()`);
  await page.runTask({ type: 'drive', to: home, r: 10, maxKmh: 60, timeout: legSecs }, `e09-${col}-home`, { maxSecs: legSecs + 60, every: 60 });
  const fin = await page.runTask({ type: 'mission', attach: true, stageTimeout: 90, cardReadMs: 2500, tourN: 0 }, `e09-${col}-kitchen`, { maxSecs: 300, every: 30 });

  // Every card after it: the end cards (#story), then the summer-end screen (#cinematic).
  const cards = [];
  for (let i = 0; i < 10; i++) {
    let c = null;
    for (let w = 0; w < 8 && !c; w++) { c = await page.evaluate('window.__RV.cardUp()'); if (!c) await page.sleep(400); }
    if (!c) break;
    const txt = await page.evaluate(c === 'story'
      ? `(() => { const s = document.getElementById('story'); return { title: s.querySelector('.stitle')?.innerText || '', body: s.querySelector('.sbody')?.innerText || '' }; })()`
      : `(() => { const s = document.getElementById('cinematic'); return { title: s.querySelector('h1')?.innerText || '', body: s.querySelector('.cinema-body')?.innerText || '', task: s.querySelector('.cinema-task')?.innerText || '' }; })()`);
    cards.push({ card: c, ...txt });
    await page.sleep(1500);
    await page.shot(`e09-${col}-card-${i}`, { hud: false });
    await page.tap('Enter'); await page.sleep(900);
  }
  await page.sleep(1500);
  const after = await page.evaluate(`(async () => { const A = window.AYLMER, G = A.G; clearInterval(window.__E09.t);
    const S = await import('/src/game/story.js'); const R = await import('/src/game/arc.js');
    return { done: G.done.has('arcdernier'), summerOver: !!G.summerOver, ending: G.stats && G.stats.ending, mode: G.mode, mission: !!G.mission,
      endTitles: S.END_CARDS.map((c) => c.title), heatMax: window.__E09.heatMax, money: Math.round(G.wallet.value), damage: G.veh.damage || 0,
      vehicle: G.veh.spec.id, objective: (document.getElementById('objective') || {}).innerText || '', summary: G.summerSummary || null,
      friends: R.FINALE_CALLBACKS.filter((c) => ${JSON.stringify(tour)}.includes(c.at)).flatMap((c) => (c.friends || []).map((f) => f[1])),
      texts: window.__RV.texts.slice(window.__E09.texts0).map((x) => x.text) }; })()`);
  await page.shot(`e09-${col}-free-roam-after`);
  const titles = cards.filter((c) => c.card === 'story').map((c) => c.title);
  const summary = cards.find((c) => c.card === 'cinematic' && /Ton été|Your summer/.test(c.title));
  assert(fin.outcome === 'done' && after.done, `${col} end: the finale is done (${fin.outcome})`);
  assert(JSON.stringify(titles) === JSON.stringify(after.endTitles), `${col} end: the end cards, in order, once each`, titles);
  assert(after.summerOver && after.ending === 'waterloo', `${col} end: summerOver, ending waterloo`);
  assert(!!summary, `${col} end: the summer-end screen came after the cards`, cards.map((c) => c.title));
  assert(summary && /Histoire|Story/.test(summary.task) && /km/.test(summary.task) && /\$/.test(summary.task), `${col} end: the screen sums the summer up (story, km, money)`, summary && summary.task);
  assert(summary && !/[–—]/.test(summary.title + summary.body + summary.task), `${col} end: no dashes on the screen`);
  assert(after.mode === 'drive' && !after.mission && after.objective.length > 0, `${col} end: free roam goes on (« ${after.objective.replace(/\s+/g, ' ').slice(0, 60)} »)`);
  assert(after.vehicle === 'ranger', `${col} end: in the Ranger`);
  assert((fin.assists || []).length === 0, `${col} end: no assist in the kitchen (${JSON.stringify(fin.assists || [])})`);
  assert(after.heatMax === 0, `${col} end: no police all night (${after.heatMax})`);
  const shown = after.friends.filter((f) => after.texts.some((t) => t.includes(f.slice(1, 20))));
  const ascii = (s) => !/[éèêàçùôî]|\b(le|la|les|des|pis|t'es|c'est)\b/i.test(s);
  assert(shown.every(ascii), `${col} end: the friends' lines that showed are English (${shown.length})`, shown);
  return { minutes: +((Date.now() - t0) / 60000).toFixed(2), legs, cards, summary: after.summary, outcome: fin.outcome, stages: fin.stages,
    assists: fin.assists, damageStart: start.damage, damageEnd: after.damage, moneyStart: start.money, money: after.money, heatMax: after.heatMax,
    frames: await page.frameStats() };
}
