// B-06 script beat: the HUD trim and the new slots, in the real game.
// A plan runs it as { "do": "script", "id": "B-06", "vehicle": false }
// (harness: --plan full --only B-06).
//
// 1. Top-left: alternateur (shot 030) and sayyad (shots 057, 058) started the
//    way a player starts them; 5.5 s later the top-left holds at most 2 text
//    lines (the sub line has faded), and no HUD boxes overlap.
// 2. The « Tab » map chip: shown with 30 s at the wheel, gone with 130 s.
// 3. The style chain readout is up within 200 ms of a style event, both from
//    a tip (hud.styleTip, the B-03 contract) and from G.style.hudState()
//    alone. B-03 is not merged on this head, so G.style is a stand-in with
//    hudState()'s exact shape; the real one replaces it once B-03 lands.
// 4. In the cart at a timed pillar: the wrong-vehicle chip shows, and the
//    minimap has the own-truck marker.
// Everything is put back: the job abandoned, the Ranger, G.style removed.
export async function run(page, assert) {
  const ev = async (js) => JSON.parse(await page.evaluate(`(async () => JSON.stringify(await (async () => { ${js} })()))()`));
  const out = {};
  await ev(`window.__b06 = {
    cur() { const G = window.AYLMER.G; return (G.veh && G.veh.spec && G.veh.spec.id) || G.carId; },
    into(id) { const G = window.AYLMER.G; if (this.cur() === id) return; G.parked[id] = { x: G.veh.x + 3, z: G.veh.z, yaw: G.veh.yaw }; G.swapCar(id); },
    uncard() { const C = window.AYLMER.cinema; for (let i = 0; i < 6 && C && C.active; i++) C.finish(); },
    vis(el) { if (!el || !el.isConnected || el.closest('.hidden')) return false; for (let p = el; p; p = p.parentElement) { const s = getComputedStyle(p); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity < 0.05) return false; } return true; },
    topLeft() {
      const W = innerWidth, H = innerHeight; let n = 0; const what = [];
      for (const id of ['objective', 'sub']) {
        const el = document.getElementById(id);
        if (!this.vis(el) || !(el.textContent || '').trim()) continue;
        const r = document.createRange(); r.selectNodeContents(el); const b = r.getBoundingClientRect();
        if (b.width < 2 || b.left > W * 0.45 || b.top > H * 0.2) continue;
        const cs = getComputedStyle(el); const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2;
        const k = Math.max(1, Math.round(b.height / lh)); n += k; what.push(id + ':' + k);
      }
      return { lines: n, what };
    },
    boxes() {
      const out = [];
      const add = (name, el) => { if (!this.vis(el)) return; const r = el.getBoundingClientRect(); if (r.width > 2 && r.height > 2) out.push({ name, x: r.left, y: r.top, w: r.width, h: r.height }); };
      for (const id of ['timer', 'speedo', 'minimap', 'street', 'prompt', 'tuto', 'legend', 'envelope', 'fuel', 'dmgwrap', 'gear', 'stars', 'repairhint', 'radio', 'stylechain', 'vehchip']) add(id, document.getElementById(id));
      document.querySelectorAll('#reactstats').forEach((e, i) => add('reactstats' + i, e));
      const ov = [];
      for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
        const a = out[i], b = out[j];
        if (Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 2 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 2) ov.push(a.name + 'x' + b.name);
      }
      return ov;
    },
  }; return 1;`);

  // 1. Top-left after 5 s, on the jobs of shots 030, 057 and 058.
  out.topLeft = [];
  for (const id of ['alternateur', 'sayyad']) {
    await page.evaluate(`(() => { const A = window.AYLMER; if (A.G.mission) A.abandon(); window.__b06.into('ranger'); return 1; })()`);
    const seed = await page.seedFor(id);
    const r0 = await ev(`const A = window.AYLMER, G = A.G, F = window.__b06;
      if (G.mission) A.abandon();
      const P = (await import('/src/game/places.js')).PLACES;
      const M = await import('/src/game/missions.js');
      let def = M.ALL_MISSIONS.find((d) => d.id === ${JSON.stringify(id)});
      if (!M.missionAvailable(G, def)) def = { ...def, id: def.id + '_b06' };
      const p = P[def.giver]; if (p) await A.teleport(p.x + 6, p.z + 6, 0);
      const started = A.start(def);
      for (let i = 0; i < 40; i++) { F.uncard(); await new Promise((r) => setTimeout(r, 100)); if (!A.cinema.active && i > 3) break; }
      return { started: started !== false, job: A.job() && A.job().id, sub: document.getElementById('sub').textContent.slice(0, 60), tl: F.topLeft() };`);
    await page.sleep(5600);
    const r1 = await ev(`const F = window.__b06, A = window.AYLMER;
      return { job: A.job() && A.job().id, tl: F.topLeft(), overlaps: F.boxes(), subFaded: A.hud.slotState().subFaded };`);
    const row = { id, seed: seed && seed.available, start: r0, after: r1 };
    out.topLeft.push(row);
    page.say(`  B-06 top-left ${id}: at start ${r0.tl.lines} (${r0.tl.what}), after 5.6 s ${r1.tl.lines} (${r1.tl.what}), overlaps ${r1.overlaps.length}`);
    await page.shot('B-06-topleft-' + id);
    assert(r0.started && !!r1.job, `${id} is running (${r1.job})`);
    assert(r1.tl.lines <= 2, `${id}: at most 2 top-left text lines after 5 s (${r1.tl.lines}: ${r1.tl.what})`);
    assert(r1.overlaps.length === 0, `${id}: no HUD boxes overlap (${r1.overlaps.join(' ') || 'none'})`);
  }
  await page.evaluate(`(() => { const A = window.AYLMER; if (A.G.mission) A.abandon(); return 1; })()`);

  // 2. The Tab chip: drawn the way ui.js Tutorial.render() draws the map step.
  out.tab = await ev(`const A = window.AYLMER, G = A.G, F = window.__b06;
    const tu = document.getElementById('tuto'), was = { cls: tu.className, cap: tu.querySelector('.cap').textContent, txt: tu.querySelector('.txt').textContent, pt: G.playtime };
    tu.classList.remove('hidden', 'ok', 'hud-yield'); // a yield (centre full) is layoutCentre's, not the 2 min rule tu.querySelector('.cap').textContent = 'Tab'; tu.querySelector('.txt').textContent = 'Tab pour la carte de la ville';
    // Synchronous: the live tutorial redraws its own chip on the next frame.
    const at = async (pt) => { tu.classList.remove('hidden', 'ok', 'hud-yield'); tu.querySelector('.cap').textContent = 'Tab'; G.playtime = pt; A.hud.tickSlots(true); tu.classList.remove('hud-yield'); return !tu.classList.contains('hud-gone') && getComputedStyle(tu).display !== 'none'; };
    const early = await at(30), late = await at(130);
    const diag = { cls: tu.className, cap: tu.firstChild && tu.firstChild.textContent, found: A.hud._tuto === tu, pt: G.playtime, slot: A.hud.slotState() };
    tu.className = was.cls; tu.querySelector('.cap').textContent = was.cap; tu.querySelector('.txt').textContent = was.txt; G.playtime = was.pt; A.hud.tickSlots(true);
    return { early, late, diag };`);
  page.say(`  B-06 Tab chip: at 30 s ${out.tab.early}, at 130 s ${out.tab.late} ${JSON.stringify(out.tab.diag)}`);
  assert(out.tab.early === true && out.tab.late === false, `the Tab chip shows in the first 2 min only (30 s ${out.tab.early}, 130 s ${out.tab.late})`);

  // 3. The chain readout within 200 ms of a style event.
  out.chain = await ev(`const A = window.AYLMER, G = A.G, F = window.__b06;
    const el = document.getElementById('stylechain');
    const stub = { n: 0, at: 0, hudState() { const on = this.n > 0 && performance.now() - this.at < 3000;
      return { on, mult: this.n >= 6 ? 3 : this.n >= 3 ? 2 : 1, events: on ? this.n : 0, fade: on ? Math.max(0, 1 - (performance.now() - this.at) / 3000) : 0,
        x3T: 0, oncoming: false, last: null, lastAgo: null, total: 0, text: on ? 'STYLE x' + (this.n >= 6 ? 3 : this.n >= 3 ? 2 : 1) : '' }; } };
    const had = G.style; G.style = stub;
    const until = (t0) => new Promise((res) => { const f = () => { if (F.vis(el)) res(Math.round(performance.now() - t0)); else if (performance.now() - t0 > 2000) res(null); else setTimeout(f, 8); }; f(); });
    // a: the state alone (no tip), b: a tip through the B-03 contract.
    const gone = (t0) => new Promise((res) => { const f = () => { if (!F.vis(el)) res(Math.round(performance.now() - t0)); else if (performance.now() - t0 > 6000) res(null); else setTimeout(f, 8); }; f(); });
    stub.n = 1; stub.at = performance.now(); const a = await until(stub.at);
    const textA = el.textContent;
    stub.n = 0; const off = await gone(performance.now());
    stub.n = 6; stub.at = performance.now(); A.hud.styleTip('+12 $ FRÔLÉ x3', 1100); const b = await until(stub.at);
    const textB = el.textContent, x3 = el.classList.contains('x3');
    const overlaps = F.boxes();
    stub.n = 0; A.hud._tip = null; await gone(performance.now());
    if (had) G.style = had; else delete G.style;
    return { stateMs: a, tipMs: b, offMs: off, textA, textB, x3, overlaps };`);
  page.say(`  B-06 chain: state ${out.chain.stateMs} ms, tip ${out.chain.tipMs} ms, « ${out.chain.textB} », overlaps ${out.chain.overlaps.length}`);
  assert(out.chain.stateMs != null && out.chain.stateMs <= 200, `chain readout up within 200 ms of the chain starting (${out.chain.stateMs} ms)`);
  assert(out.chain.tipMs != null && out.chain.tipMs <= 200, `chain readout up within 200 ms of a style tip (${out.chain.tipMs} ms)`);
  assert(/STYLE x3/.test(out.chain.textB) && /FRÔLÉ/.test(out.chain.textB) && out.chain.x3, `the readout says the chain and the tip (« ${out.chain.textB} »)`);
  assert(out.chain.overlaps.length === 0, `the readout overlaps nothing (${out.chain.overlaps.join(' ') || 'none'})`);

  // 4. The cart at a timed pillar: the chip and the own-truck marker.
  out.cart = await ev(`const A = window.AYLMER, G = A.G, F = window.__b06;
    if (G.mission) A.abandon();
    F.into('ranger');
    const P = (await import('/src/game/places.js')).PLACES;
    const M = await import('/src/game/missions.js');
    const J = await import('/src/game/jobready.js');
    const S = await import('/src/game/story.js');
    const home = { x: G.veh.x, z: G.veh.z, yaw: G.veh.yaw };
    let hit = null;
    for (const def of M.ALL_MISSIONS) {
      if (J.jobKind(def) !== 'timed' || !M.missionAvailable(G, def) || (G.done && G.done.has(def.id))) continue;
      const p = P[def.giver]; if (!p) continue;
      await A.teleport(p.x + 3, p.z + 3, 0);
      const n = S.nearestJob(G);
      if (n && n.def.id === def.id && n.dist <= 40) { hit = { id: def.id, giver: def.giver, dist: Math.round(n.dist) }; break; }
    }
    if (!hit) return { hit: null };
    G.parked.ranger = { x: P.home.x, z: P.home.z, yaw: 0 };
    F.into('cart');
    for (let i = 0; i < 4; i++) { window.AYLMER.step(1 / 60); }
    A.render && A.render();
    await new Promise((r) => setTimeout(r, 250));
    A.hud.tickSlots(true);
    await new Promise((r) => setTimeout(r, 30));
    const s = A.hud.slotState();
    const chipVis = F.vis(document.getElementById('vehchip'));
    const overlaps = F.boxes();
    return { hit, vehicle: F.cur(), chip: s.vehChip, chipVis, own: s.own, overlaps };`);
  page.say(`  B-06 cart at a timed pillar: ${JSON.stringify(out.cart).slice(0, 300)}`);
  await page.shot('B-06-cart-pillar');
  assert(!!out.cart.hit, `found a timed pillar (${out.cart.hit && out.cart.hit.id})`);
  assert(out.cart.vehicle === 'cart' && out.cart.chipVis && /chronométrée/.test(out.cart.chip || ''), `the wrong-vehicle chip shows in the cart at a timed pillar (« ${out.cart.chip} »)`);
  assert(!!out.cart.own && out.cart.own.id === 'ranger', `the minimap marks the Ranger (${JSON.stringify(out.cart.own)})`);
  assert(out.cart.overlaps.length === 0, `the chip overlaps nothing (${out.cart.overlaps.join(' ') || 'none'})`);

  // Put everything back.
  out.back = await ev(`const A = window.AYLMER, G = A.G, F = window.__b06;
    if (G.mission) A.abandon();
    F.into('ranger');
    const P = (await import('/src/game/places.js')).PLACES;
    await A.teleport(P.home.x + 6, P.home.z + 6, 0);
    A.hud.tickSlots(true);
    return { vehicle: F.cur(), chip: A.hud.slotState().vehChip };`);
  assert(out.back.vehicle === 'ranger' && !out.back.chip, `back in the Ranger, no chip (${out.back.vehicle}, ${out.back.chip})`);
  return out;
}
