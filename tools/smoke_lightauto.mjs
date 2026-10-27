#!/usr/bin/env node
// W8-LIGHTAUTO (Tom, 27 Oct): Advanced lighting is on by default; when the game
// averages under 50 fps for ~8 s of real driving, a small card offers to turn
// it off. This checks the watch (game/look/lightwatch.js) on synthetic frame
// sequences, the states it must ignore, once per session, « Garder » kept on
// the browser, no allocation per frame, QA and perf never seeing the card, and
// how main.js wires it. Pure: no world, no map, no GL.
//
//   node tools/smoke_lightauto.mjs
import { readFileSync } from 'node:fs';
import v8 from 'node:v8';
import vm from 'node:vm';
let pass = 0, fail = 0;
const ok = (c, m, extra = '') => {
  if (c) { pass++; console.log('  ok  ' + m); } else { fail++; console.log('  FAIL ' + m + (extra ? '  - ' + extra : '')); }
};

const mem = new Map();
const ls = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k), clear: () => mem.clear(), key: (i) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; } };
globalThis.window = { localStorage: ls, devicePixelRatio: 1 };
Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true, writable: true });

const adv = await import('../src/game/look/advlight.js');
const W = await import('../src/game/look/lightwatch.js');
const store = await import('../src/game/store.js');
const i18n = await import('../src/game/i18n.js');

// Feed `seconds` of frames at `fps`; returns the first non-zero result and when.
const feed = (w, fps, seconds, driving = true) => {
  const dt = 1 / fps;
  for (let t = 0; t < seconds; t += dt) { const r = w.frame(dt, driving); if (r) return { fps: r, at: t }; }
  return null;
};

console.log('the watch: under 50 fps for ~8 s of driving, after a ~10 s grace');
{
  const w = W.createFpsWatch();
  ok(W.FPS_MIN === 50 && W.WINDOW_S === 8 && W.GRACE_S === 10, 'limits: 50 fps, 8 s window, 10 s grace');
  const r = feed(w, 40, 60);
  ok(r && Math.abs(r.fps - 40) < 0.5, 'a steady 40 fps drive fires with ~40 fps', JSON.stringify(r));
  ok(r && r.at > 17.5 && r.at < 18.6, 'it fires after the grace plus the window (~18 s), not before', r && r.at.toFixed(2));
  ok(feed(W.createFpsWatch(), 60, 120) === null, '60 fps for two minutes: never');
  ok(feed(W.createFpsWatch(), 51, 120) === null, '51 fps: never');
  const b = feed(W.createFpsWatch(), 49, 60);
  ok(b && b.fps < 50 && b.fps > 48, '49 fps: fires');
  // A short dip does not fire: 4 s at 30 fps inside 120 fps driving averages well over 50.
  const m = W.createFpsWatch();
  feed(m, 120, 12);
  let hit = feed(m, 30, 4); hit = hit || feed(m, 120, 30);
  ok(hit === null, 'a 4 s dip to 30 fps inside fast driving: never');
  // A dip that lasts: 30 fps for 9 s after the grace fires.
  const d = W.createFpsWatch();
  feed(d, 120, 12);
  ok(!!feed(d, 30, 9), '9 s at 30 fps after the grace: fires');
  // 144 Hz and 240 Hz displays fill the ring without trouble.
  ok(feed(W.createFpsWatch(), 240, 60) === null && feed(W.createFpsWatch(), 144, 60) === null, '144 and 240 Hz: never');
  // Under 50 fps an 8 s window holds under 400 frames; the 2048 ring covers 8 s up to 256 Hz.
  ok(2048 / W.WINDOW_S > W.FPS_MIN * 5, 'the ring holds a full window far above the limit');
}

console.log('excluded states: load, film, cards, menus, pause, replay, after a bake');
{
  ok(feed(W.createFpsWatch(), 20, 120, false) === null, 'not driving (any excluded state): never, however slow');
  const w = W.createFpsWatch();
  feed(w, 30, 17);                       // grace and most of a window
  ok(!w.fired, 'not yet at 17 s');
  w.frame(1 / 30, false);                // a card, the pause, a sector card, the map...
  ok(w.count === 0 && w.grace === W.GRACE_S, 'one excluded frame empties the window and restarts the grace');
  const again = feed(w, 30, 30);
  ok(again && again.at > 17.5, 'and the next fire needs a full grace plus window again', again && again.at.toFixed(2));
  const h = W.createFpsWatch();
  feed(h, 30, 15);
  h.frame(2.5, true);                    // a tab switch or a stall
  ok(h.count === 0 && h.grace === W.GRACE_S, 'a frame of a second or more restarts it (tab switch, stall)');
  const g = W.createFpsWatch();
  ok(feed(g, 30, 9.9) === null && g.count === 0, 'nothing is even counted during the grace');
  // A drive that keeps being interrupted every 15 s never fires.
  const i = W.createFpsWatch();
  let any = null;
  for (let k = 0; k < 10 && !any; k++) { any = feed(i, 30, 15); i.frame(1 / 30, false); }
  ok(any === null, 'interrupted every 15 s (cards, jobs): never');
}

console.log('once per session');
{
  const w = W.createFpsWatch();
  ok(!!feed(w, 30, 30), 'fires once');
  ok(w.fired && feed(w, 20, 120) === null, 'then never again this session');
  w.reset();
  ok(w.fired && feed(w, 20, 60) === null, 'a reset does not re-arm it');
  const src = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  ok(/if \(lightWatch\.fired && !lightPrompt\.open\) return;/.test(src), 'main.js stops looking once it fired and the card is gone');
  ok(/if \(this\.step\) return;/.test(readFileSync(new URL('../src/game/look/lightwatch.js', import.meta.url), 'utf8')), 'a card already up is never shown twice');
}

console.log('no allocation per frame');
{
  const w = W.createFpsWatch();
  ok(w.ring instanceof Float64Array && w.ring.length === 2048, 'the window is one fixed Float64Array');
  const body = w.frame.toString();
  ok(!/\bnew\b|=>|\[\s*\]|\.push\(|\.slice\(|\.concat\(|\.\.\.|`/.test(body), 'frame() builds nothing (no new, closures, arrays, spreads, templates)');
  const keysSrc = W.LightPrompt.prototype.keys.toString() + W.LightPrompt.prototype.frame.toString() + W.LightPrompt.prototype.setVisible.toString();
  ok(!/\bnew\b|=>|\[\s*\]|\.\.\.|`/.test(keysSrc), 'the card\'s per-frame code builds nothing either');
  v8.setFlagsFromString('--expose-gc');
  const gc = vm.runInNewContext('gc');
  const dt = 1 / 60;
  for (let k = 0; k < 20000; k++) w.frame(dt, true);
  gc(); gc();
  const h0 = process.memoryUsage().heapUsed;
  for (let k = 0; k < 2000000; k++) w.frame(k % 600 === 0 ? dt * 3 : dt, true);
  gc(); gc();
  const grow = process.memoryUsage().heapUsed - h0;
  ok(grow < 256 * 1024, `two million frames grow the heap by ${(grow / 1024).toFixed(1)} KB (< 256 KB)`);
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const fn = main.slice(main.indexOf('function lightWatchFrame('), main.indexOf('// The main animation loop.'));
  ok(fn.length > 100 && !/\bnew\b|=>|\[\s*\]|\.\.\.|`/.test(fn), 'main.js lightWatchFrame builds nothing');
}

console.log('QA, perf, harness and rig never see the card');
{
  const plain = { search: '', review: null, webdriver: false, ua: 'Mozilla/5.0 (Macintosh) Chrome/130.0 Safari/537.36' };
  ok(W.lightPromptSuppressed(plain) === false, 'a player\'s page: the card may show');
  ok(W.lightPromptSuppressed({ ...plain, search: '?light=on' }) && W.lightPromptSuppressed({ ...plain, search: '?light=off' }), '?light=on|off (an explicit choice for the run): never');
  ok(W.lightPromptSuppressed({ ...plain, search: '?review=perf&light=on' }), 'perf (?review=perf): never');
  ok(W.lightPromptSuppressed({ ...plain, search: '?review=hud' }) && W.lightPromptSuppressed({ ...plain, search: '?audioReview=1' }), 'any review namespace: never');
  ok(W.lightPromptSuppressed({ ...plain, review: 'harness' }), 'framed by a tools/ harness: never');
  ok(W.lightPromptSuppressed({ ...plain, webdriver: true }), 'a driven browser (navigator.webdriver): never');
  ok(W.lightPromptSuppressed({ ...plain, ua: 'Mozilla/5.0 HeadlessChrome/130.0' }), 'HeadlessChrome: never');
  const perf = readFileSync(new URL('./qa/perf.mjs', import.meta.url), 'utf8');
  ok(/index\.html\?review=perf&light=\$\{params\.light\}/.test(perf), 'perf.mjs keeps its explicit ?light= under ?review=perf');
  const boot = readFileSync(new URL('./qa/boot.mjs', import.meta.url), 'utf8');
  ok(/arg\('light'/.test(boot), 'boot.mjs still takes --light');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  ok(/if \(lightQuiet \|\| !lightWatchArmed\(G\.settings\)\) return;/.test(main), 'main.js checks quiet and armed before watching');
  // ?light= also pins the lighting itself (advlight.js reads the URL before the settings).
  const advSrc = readFileSync(new URL('../src/game/look/advlight.js', import.meta.url), 'utf8');
  ok(/const u = readUrl\(\); V = u === null \? readSetting\(\) : u;/.test(advSrc), 'the URL value wins over the setting and the default');
}

console.log('armed only with Advanced lighting on and no « Garder »');
{
  adv.setAdvLight(true);
  ok(W.lightWatchArmed({}) === true, 'on, never answered: armed');
  ok(W.lightWatchArmed({ advLightNoAsk: true }) === false, 'on, « Garder » said: not armed');
  adv.setAdvLight(false);
  ok(W.lightWatchArmed({}) === false, 'off: nothing to offer');
  adv.setAdvLight(null);
}

// A fake Input with only the edges the test presses.
const fakeInput = (codes) => {
  const pressed = new Set(codes), consumed = [];
  return { consumed, hit: (...c) => c.some((x) => pressed.has(x)), consume: (...c) => { for (const x of c) { consumed.push(x); pressed.delete(x); } } };
};
const DRIVING = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter', 'Escape'];

console.log('the card: words, keys, choices');
{
  ok(!W.KEY_FIRST.concat(W.KEY_SECOND).some((k) => DRIVING.includes(k)), 'its keys are 1 / 2 / numpad / LB / RB, never a driving key');
  const log = [];
  const mk = (relaunchOk = true) => new W.LightPrompt({ doc: null, t: i18n.t,
    disable: () => log.push('disable'), keep: () => log.push('keep'),
    relaunch: () => { log.push('relaunch'); return relaunchOk; }, toast: (s) => log.push('toast:' + s) });
  i18n.setLang('fr');
  const p = mk();
  p.show(43.6);
  ok(p.open && p.step === 'ask' && p.fps === 44, 'shown with the rounded fps');
  let m = p.message();
  ok(m.msg === 'Le jeu rame un peu (44 i/s). Éclairage avancé : le désactiver?', 'French by default', m.msg);
  ok(/Désactiver$/.test(m.first) && /Garder$/.test(m.second), '[Désactiver] [Garder]');
  i18n.setLang('en');
  m = p.message();
  ok(m.msg === 'The game is running a bit slow (44 fps). Turn off Advanced lighting?' && /Turn off$/.test(m.first) && /Keep$/.test(m.second), 'English when the game is');
  i18n.setLang('fr');
  // Driving keys pass straight through.
  const inW = fakeInput(['KeyW', 'ArrowLeft', 'Space', 'Enter']);
  ok(p.keys(inW) === false && inW.consumed.length === 0 && p.step === 'ask', 'W, arrows, Space, Enter: untouched, nothing chosen');
  // Hidden outside driving: its keys do nothing there.
  p.frame(1 / 60, false);
  ok(!p.visible, 'hidden while not driving (pause, menus, cards)');
  ok(p.keys(fakeInput(['Digit1'])) === false && p.step === 'ask', 'and its keys do nothing while hidden');
  p.frame(1 / 60, true);
  ok(p.visible, 'back while driving');
  const in1 = fakeInput(['Digit1', 'KeyW']);
  ok(p.keys(in1) === true && log.includes('disable') && p.step === 'relaunch', '1: Désactiver writes off and asks when');
  ok(!in1.consumed.includes('KeyW') && in1.consumed.includes('Digit1'), 'it consumed its own key only');
  m = p.message();
  ok(/Relancer maintenant$/.test(m.first) && /Au prochain lancement$/.test(m.second), '[Relancer maintenant] [Au prochain lancement]');
  ok(p.keys(fakeInput(['PadLB'])) === true && log.includes('relaunch') && !p.open, 'LB: relaunch now (autosave, then reload)');
  // Later.
  log.length = 0;
  const q = mk(); q.show(40); q.choose(1);
  ok(q.keys(fakeInput(['Numpad2'])) && log.some((s) => s.startsWith('toast:Éclairage avancé: désactivé au prochain lancement')) && !log.includes('relaunch') && !q.open, '2: at next launch, a toast, no reload');
  // A save that failed never reloads.
  log.length = 0;
  const r = mk(false); r.show(40); r.choose(1);
  ok(r.choose(1) === 'nosave' && log.some((s) => s.startsWith('toast:Sauvegarde impossible')), 'no save, no reload: it says so');
  // Garder.
  log.length = 0;
  const k = mk(); k.show(40);
  ok(k.keys(fakeInput(['PadRB'])) && log.includes('keep') && !log.includes('disable') && !k.open, 'RB / 2: Garder');
  // Unanswered: folds away after CARD_S of driving.
  const u = mk(); u.show(40);
  for (let t = 0; t < W.CARD_S + 1; t += 1 / 60) u.frame(1 / 60, true);
  ok(!u.open, `unanswered, it folds away after ${W.CARD_S} s on screen`);
}

console.log('the settings the card writes');
{
  adv.setBrowserDefault(true);
  mem.clear(); adv.setAdvLight(null);
  ok(adv.advLight() === true, 'a fresh browser runs it on');
  const off = store.saveSettings(W.lightOffSettings(store.loadSettings()));
  ok(off.advLight === false && off.advLightChosen === true, 'Désactiver: off, and marked as chosen');
  adv.setAdvLight(null);
  ok(adv.advLight() === false, 'the next launch runs it off');
  mem.clear(); adv.setAdvLight(null);
  const kept = store.saveSettings(W.lightKeepSettings(store.loadSettings()));
  ok(kept.advLightNoAsk === true && store.loadSettings().advLightNoAsk === true, 'Garder: stored on this browser');
  ok(store.loadSettings().advLight === true && store.loadSettings().advLightChosen === false, 'Garder changes nothing else (still the default, still on)');
  adv.setAdvLight(null);
  ok(W.lightWatchArmed(store.loadSettings()) === false, 'so it never asks again on this browser');
  store.saveSettings({ ...store.loadSettings(), cam: 3 });
  ok(store.loadSettings().advLightNoAsk === true, 'and other options saved later keep it');
  mem.clear(); adv.setAdvLight(null); adv.setBrowserDefault(null);
}

console.log('main.js wiring');
{
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const fn = main.slice(main.indexOf('function lightWatchFrame('), main.indexOf('// The main animation loop.'));
  for (const s of ["G.mode === 'drive'", '!opening.active', '!cinema.active', '!story.active', '!G.seamHold', '!crashReplay.playing',
    '!(endingCard && endingCard.active)', '!G.mealShift', '!modalOpen()', "document.visibilityState !== 'hidden'"]) {
    ok(fn.includes(s), 'driving excludes ' + s.replace(/^!/, ''));
  }
  ok(/try \{ frame\(now\); \} finally \{ runEconomyPulse\(\); \}\n  lightWatchFrame\(now\);/.test(main), 'fed once a frame from the loop, after the game frame and its pulse');
  const frame = main.slice(main.indexOf('function frame(now)'), main.indexOf('function padOutsideDrive'));
  ok(frame.indexOf('lightPrompt.keys(input)') > 0 && frame.indexOf('lightPrompt.keys(input)') < frame.indexOf('  handleKeys();'), 'the card reads its keys before the game does (LB / RB never reach the radio or camera)');
  ok(/relaunch: \(\) => \{ if \(!autosave\('light'\)\) return false; location\.reload\(\); return true; \}/.test(main), 'relaunch: the existing autosave first, no reload without it');
  ok(/saveSettings\(lightOffSettings\(G\.settings\)\)/.test(main) && /saveSettings\(lightKeepSettings\(G\.settings\)\)/.test(main), 'both choices go through store.saveSettings');
  ok(i18n.t('light.slow') !== 'light.slow', 'the strings exist');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
