// B-03 script beat: the style chain is live in the running game.
// A plan runs it as { "do": "script", "id": "B-03" }. Put it after speedRun or
// cops to read what that beat's real driving paid.
//
// 1. Live: drives a few seconds in whatever the beat starts in, then reads what
//    reactive.js keeps: G.style (style.js's chain), its hudState(), and the style
//    keys on G.stats (styleTips, styleNear, styleOncomingM, styleBestChain...).
//    These are the real numbers of the session so far: nothing synthetic is fed
//    into the live chain.
// 2. The tip path, end to end: the real Reactive.styleStep on a FRESH chain and
//    a throwaway stats object, with the game's own HUD. Three near misses in
//    three steps: each shows in #stylechain the same frame (hud.styleTip), the
//    shared toast queue (hud.toasts) does not grow, and the throwaway
//    stats.nearMiss stays 0 (cops.js reads that one).
export async function run(page, assert) {
  const s0 = await page.state();
  assert(s0 && s0.mode === 'drive', 'the game is in drive mode');
  await page.runTask({ type: 'floor', seconds: 6, steer: 0 }, 'script-b03', { maxSecs: 20, every: 60 });
  const live = await page.evaluate(`(() => {
    const G = window.AYLMER && window.AYLMER.G;
    if (!G || !G.style) return null;
    const s = G.stats || {};
    const pick = (k) => (Number.isFinite(s[k]) ? +s[k].toFixed(1) : null);
    const h = G.style.hudState();
    return { hud: { on: h.on, mult: h.mult, events: h.events, total: h.total }, counts: { ...G.style.counts },
      stats: { styleTips: pick('styleTips'), styleNear: pick('styleNear'),
      styleSlides: pick('styleSlides'), styleAir: pick('styleAir'), styleOncomingM: pick('styleOncomingM'),
      styleBestChain: pick('styleBestChain'), nearMiss: pick('nearMiss') }, money: G.wallet ? Math.round(G.wallet.value) : null };
  })()`);
  assert(!!live, 'G.style exists: reactive.js ticks the chain');
  assert(live && live.stats.styleTips !== null, 'G.stats carries the style keys');
  page.say(`  B-03 live: ${JSON.stringify(live && live.stats)}`);

  const fed = await page.evaluate(`(async () => {
    const A = window.AYLMER, G = A.G;
    const S = await import('/src/game/style.js');
    const R = G.reactive && Object.getPrototypeOf(G.reactive);
    if (!R || typeof R.styleStep !== 'function' || !G.hud) return null;
    const self = { style: new S.StyleChain(), stats: { nearMiss: 0 }, friendFor: () => null };
    const near = [];
    const fake = { mode: 'drive', hud: G.hud, audio: null, wallet: { value: 0, add(n) { this.value += n; } }, input: null,
      stats: self.stats, traffic: { nearMisses: near, cars: [] }, veh: G.veh, mission: null };
    const q0 = G.hud.toasts ? G.hud.toasts.pending.length + G.hud.toasts.active.length : null;
    const out = [];
    for (let i = 0; i < 3; i++) {
      near.length = 0; near.push({ gap: 0.7, speed: 25, kind: 'car' });
      const t0 = performance.now();
      R.styleStep.call(self, 1 / 60, fake, G.veh);
      const el = document.querySelector('#stylechain span');
      out.push({ text: el ? el.textContent : null, ms: +(performance.now() - t0).toFixed(1) });
    }
    const q1 = G.hud.toasts ? G.hud.toasts.pending.length + G.hud.toasts.active.length : null;
    return { tips: out, toastQueueBefore: q0, toastQueueAfter: q1, nearMiss: self.stats.nearMiss, styleNear: self.stats.styleNear,
      mult: self.style.mult, paid: fake.wallet.value };
  })()`);
  assert(!!fed, 'Reactive.styleStep and the HUD are reachable');
  assert(fed && fed.tips.every((t) => /FRÔLÉ x\d$/.test(t.text || '')), `each tip is in #stylechain the frame it happens (${fed && fed.tips.map((t) => t.text).join(' | ')})`);
  assert(fed && fed.toastQueueAfter === fed.toastQueueBefore, `the shared toast queue did not grow (${fed && fed.toastQueueBefore} -> ${fed && fed.toastQueueAfter})`);
  assert(fed && fed.nearMiss === 0 && fed.styleNear === 3, `traffic near misses land on styleNear, not nearMiss (${fed && fed.nearMiss} / ${fed && fed.styleNear})`);
  // Put the HUD tip line back to the live chain's.
  await page.evaluate(`(() => { const H = window.AYLMER.G.hud; if (H) { H._tip = null; H.tickSlots && H.tickSlots(true); } return 1; })()`);
  await page.shot('script-b03');
  return { ...live, fed };
}
