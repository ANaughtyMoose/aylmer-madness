#!/usr/bin/env node
// W8-LIGHT: « Éclairage avancé » / "Advanced lighting" (Tom, 27 Oct). One
// per-device option. W8-LIGHTAUTO (Tom, 27 Oct): default ON in a browser that
// never chose; a choice is kept (advLightChosen). Off must be fix/look-on-qr exactly: the same
// assembled shader source, the same look flags, today's light grade, no new
// uniform writes. The choice lives in the browser's settings, never in a save
// slot, so the Mac mini (on) and the Air (off) keep their own with one summer.
//
//   node tools/smoke_advlight.mjs
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
let pass = 0, fail = 0;
const ok = (c, m, extra = '') => {
  if (c) { pass++; console.log('  ok  ' + m); } else { fail++; console.log('  FAIL ' + m + (extra ? '  - ' + extra : '')); }
};

// A browser's localStorage, behind window (advlight.js reads window.localStorage).
const mem = new Map();
const ls = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k), clear: () => mem.clear(), key: (i) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; } };
globalThis.window = { localStorage: ls, devicePixelRatio: 1 };
Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true, writable: true });

const adv = await import('../src/game/look/advlight.js');
const store = await import('../src/game/store.js');
const options = await import('../src/game/options.js');
const i18n = await import('../src/game/i18n.js');
const save = await import('../src/game/save.js');
const shaders = await import('../src/core/shaders/index.js');
const flags = await import('../src/game/look/flags.js');
const light = await import('../src/core/shaders/light.js');
const ao = await import('../src/game/look/aobake.js');
const sky = await import('../src/game/sky.js');
const grade = await import('../src/game/look/grade.js');
const glow = await import('../src/game/look/glow.js');
const { TIME_OF_DAY } = await import('../src/game/missions.js');

console.log('the setting: default on in a fresh browser, a choice is kept, per browser');
{
  mem.clear(); adv.setAdvLight(null);
  // Under node an unchosen value stays off (every other smoke keeps today's bakes);
  // a real page is a browser. Check both, then test as a browser.
  adv.setBrowserDefault(false);
  ok(store.loadSettings().advLight === false && adv.advLight() === false, 'node, nothing chosen: off (the other smokes keep their pins)');
  adv.setBrowserDefault(true); adv.setAdvLight(null);
  ok(store.DEFAULT_SETTINGS.advLight === true, 'DEFAULT_SETTINGS.advLight is true in a browser');
  ok(store.DEFAULT_SETTINGS.advLightChosen === false && store.DEFAULT_SETTINGS.advLightNoAsk === false, 'nothing chosen, nothing refused, out of the box');
  ok(store.loadSettings().advLight === true, 'a fresh browser loads it on');
  ok(adv.advLight() === true, 'advLight() is on with no settings stored');
  adv.setAdvLight(null);
  store.saveSettings({ ...store.loadSettings(), cam: 2 });   // any other option written: still not a choice
  ok(JSON.parse(mem.get(store.KEYS.settings)).advLightChosen === false && adv.advLight() === true, 'saving another option is not a choice: still on');
  adv.setAdvLight(null);
  mem.set(store.KEYS.settings, JSON.stringify({ advLight: false, cam: 1 }));   // a W8-LIGHT browser that never touched it (default was off)
  ok(store.loadSettings().advLight === true && adv.advLight() === true, 'an old unchosen off moves to the new default (on)');
  ok(store.normalizeSettings({ advLight: false, advLightChosen: 'yes' }).advLight === true, 'only a real true marks a choice');
  ok(store.normalizeSettings({ advLight: 'yes', advLightChosen: true }).advLight === false && store.normalizeSettings({ advLight: 1, advLightChosen: true }).advLight === false,
    'a chosen value: only a real true turns it on');
  // The player unticks it: chosen, off, and it stays off whatever the default does.
  mem.clear(); adv.setAdvLight(null);
  ok(adv.advLight() === true, 'this session started on');
  const s = store.saveSettings({ ...store.loadSettings(), advLight: false, advLightChosen: true });
  ok(s.advLight === false && store.loadSettings().advLight === false, 'chosen off, loads off');
  ok(JSON.parse(mem.get(store.KEYS.settings)).advLightChosen === true, 'the choice lives in the aylmer.settings key');
  ok(adv.advLight() === true, 'the session keeps the value it started with (next launch)');
  adv.setAdvLight(null);
  ok(adv.advLight() === false, 'the next launch reads it off');
  adv.setBrowserDefault(false); adv.setAdvLight(null);
  ok(adv.advLight() === false && store.loadSettings().advLight === false, 'chosen off stays off under either default');
  adv.setBrowserDefault(true);
  mem.set(store.KEYS.settings, JSON.stringify({ advLight: true, advLightChosen: true }));
  adv.setBrowserDefault(false); adv.setAdvLight(null);
  ok(adv.advLight() === true && store.loadSettings().advLight === true, 'chosen on stays on even where the default is off');
  adv.setBrowserDefault(true); adv.setAdvLight(null);
  // The options screen marks a change of the row as a choice.
  const optSrc = readFileSync(new URL('../src/game/options.js', import.meta.url), 'utf8');
  ok(/changed === 'advLight'\) next = \{ \.\.\.next, advLightChosen: true \}/.test(optSrc), 'ticking or unticking the option row marks it chosen');
  ok(!options.SECTIONS.some((sec) => sec.rows.some((r) => r.k === 'advLightChosen' || r.k === 'advLightNoAsk')), 'chosen and never-ask are not option rows');
  mem.clear(); adv.setAdvLight(null);
}

console.log('never in a save slot (Mac mini on, Air off, one summer)');
{
  ok(!store.PROGRESS_KEYS.includes(store.KEYS.settings), 'settings are not progress (wipe and slots leave them)');
  // save.js keeps fields it does not know (SR-05), so the guarantee is that no
  // save is ever written with the choice and the switch never reads a save.
  ok(!JSON.stringify(save.newSave('Tom')).includes('advLight'), 'a new summer carries no advLight');
  const saveSrc = readFileSync(new URL('../src/game/save.js', import.meta.url), 'utf8');
  const mainSrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const advSrc = readFileSync(new URL('../src/game/look/advlight.js', import.meta.url), 'utf8');
  ok(!/advLight/.test(saveSrc), 'save.js never mentions advLight');
  ok((mainSrc.match(/advLight/g) || []).length === 3, 'main.js only imports advLight and exposes it read-only on AYLMER');
  ok(/getItem\(SETTINGS_KEY\)/.test(advSrc) && !/aylmer\.save/.test(advSrc) && /const SETTINGS_KEY = 'aylmer\.settings';/.test(advSrc), 'the switch reads aylmer.settings only, never a save slot');
  // The mini writes a summer with the option on; the Air loads it and keeps its own off.
  mem.clear();
  store.saveSettings({ ...store.DEFAULT_SETTINGS, advLight: false, advLightChosen: true });   // the Air, by choice
  const fromMini = JSON.stringify(save.normalizeSave({ ...save.newSave('Tom'), advLight: true }, 'tom.1'));
  save.normalizeSave(JSON.parse(fromMini), 'tom.1');
  adv.setAdvLight(null);
  ok(store.loadSettings().advLight === false && adv.advLight() === false, 'loading the mini\'s summer leaves the Air off');
}

console.log('the option row');
{
  const video = options.SECTIONS.find((s) => s.id === 'video');
  ok(video.rows.some((r) => r.k === 'advLight' && r.type === 'check'), 'a checkbox in the video section');
  i18n.setLang('fr');
  ok(i18n.t('opt.advLight') === 'Éclairage avancé (au prochain lancement)', 'French label says au prochain lancement');
  i18n.setLang('en');
  ok(i18n.t('opt.advLight') === 'Advanced lighting (next launch)', 'English label says next launch');
  i18n.setLang('fr');
  const html = options.optionsHTML({ ...store.DEFAULT_SETTINGS }, { only: ['video'] });
  ok(/id="o_advLight" checked/.test(html), 'drawn checked by default (a fresh browser)');
  const off = options.optionsHTML({ ...store.DEFAULT_SETTINGS, advLight: false, advLightChosen: true }, { only: ['video'] });
  ok(/id="o_advLight"(?! checked)/.test(off), 'drawn unchecked once chosen off');
}

// fix/look-on-qr c2928ca, assembled by its own index.js: sha256 (first 16 hex)
// of vs and fs. A later shader change on fix/look-on-qr must also go into the
// CLASSIC_ side of its chunk; then update these two pins.
const TODAY = { vs: 'be2c1cd1ea2e8da5', fs: '16548b896e525cba', uniforms: 27 };
const h = (x) => createHash('sha256').update(x).digest('hex').slice(0, 16);

console.log('off: the shader is today\'s, byte for byte');
{
  adv.setAdvLight(false);
  const a = shaders.assemble();
  ok(h(a.vs) === TODAY.vs && h(a.fs) === TODAY.fs, 'assemble() with the option off equals fix/look-on-qr', `${h(a.vs)} ${h(a.fs)}`);
  ok(Object.keys(a.uniforms).length === TODAY.uniforms, `${TODAY.uniforms} uniforms, as today`);
  for (const u of ['uLinear', 'uExposure', 'uSkyL', 'uAerial', 'uNightGlow', 'uSunSkyLin']) ok(!(u in a.uniforms), `no ${u}`);
  ok(!/linearAlbedo|gReflRad|skyNoise|acesRrtOdt|glowAlbedo/.test(a.fs), 'no linear, ACES, sky noise or glow code in the program');
  const b = shaders.assemble(true);
  ok(h(b.fs) !== TODAY.fs && 'uLinear' in b.uniforms && 'uNightGlow' in b.uniforms && /acesRrtOdt/.test(b.fs), 'on: the s5-light program');
  const c = shaders.assemble();
  ok(h(c.vs) === TODAY.vs && h(c.fs) === TODAY.fs, 'and back off again, exactly');
}

console.log('off: look flags, grade and per-frame code are today\'s');
{
  adv.setAdvLight(false);
  const today = readFileSync(new URL('../src/game/look/flags.js', import.meta.url), 'utf8');
  ok(!/advLight/.test(today), 'the look flag table is untouched (the option is not a flag)');
  ok(JSON.stringify(flags.snapshot()) === JSON.stringify(flags.defaults()), 'look flags at their defaults');
  // Today's grade (fix/look-on-qr light.js gradeLight), inlined.
  const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  const old = (e) => {
    const o = { sky: [0, 0, 0], ground: [0, 0, 0], sun: [0, 0, 0] };
    const w = Math.min(1, Math.max(0, (lum(e.sun) - 0.70) / 0.15));
    const ls = lum(e.sky), lg = lum(e.ground), ds = 0.85 * w, ks = 1 - 0.08 * w, dg = 0.35 * w, kg = 1 + 0.10 * w;
    for (let i = 0; i < 3; i++) { o.sky[i] = (e.sky[i] + (ls - e.sky[i]) * ds) * ks; o.ground[i] = (e.ground[i] + (lg - e.ground[i]) * dg) * kg; }
    const up = Math.max(0.2, e.lightDir[1]) * lum(e.sun);
    let k = up > 0 ? (1.08 - lum(o.sky)) / up : 1;
    k = Math.min(1, Math.max(0.35, k)); k = 1 + (k - 1) * w;
    for (let i = 0; i < 3; i++) o.sun[i] = e.sun[i] * k;
    return o;
  };
  let same = true;
  for (const key of Object.keys(TIME_OF_DAY)) {
    const e = TIME_OF_DAY[key], out = { sky: new Float32Array(3), ground: new Float32Array(3), sun: new Float32Array(3) };
    light.gradeLight(e, out);
    const o = old(e);
    for (const f of ['sky', 'ground', 'sun']) for (let i = 0; i < 3; i++) if (Math.abs(out[f][i] - Math.fround(o[f][i])) > 1e-6) same = false;
  }
  ok(same, 'gradeLight is today\'s display grade for every time of day');
  ok(light.linearOn() === false, 'linearOn() is false');
  ok(ao.aoOn({}) === false, 'no vertex AO bake');
  ok(ao.aoOn({ opts: { ao: true } }) === true, 'a smoke can still force the bake');
  // No uniform writes and no allocation: a renderer whose uniform() throws.
  const R = { uniform() { throw new Error('uniform write with the option off'); }, isPrototype: false, time: 1, eye: [0, 0, 0],
    upload: (b) => ({ vao: {}, count: b.i.length, min: [0, 0, 0], max: [0, 0, 0] }), scale: 0.85 };
  const G = { env: JSON.parse(JSON.stringify(TIME_OF_DAY.night)), quality: 'med' };
  let threw = false;
  try { grade.init(G, R); grade.draw(R, G); glow.init(G, R); glow.draw(R, G); } catch { threw = true; }
  ok(!threw, 'grade and glow write no uniform');
  const built = sky.buildSky(R);
  ok(built.clouds.count > 0, 'the cloud puffs are drawn, as today');
  threw = false;
  let o1, o2;
  try { o1 = sky.skyOpts(G.env); o2 = sky.skyOpts(G.env); } catch { threw = true; }
  ok(!threw && o1 === o2 && o1.sky === true && o1.skyLo === G.env.fog && o1.skyHi === G.env.sky,
    'skyOpts writes no uniform and hands back today\'s three fields (one reused object)');
}

console.log('the sector Worker bakes with the main thread\'s choice');
{
  const client = readFileSync(new URL('../src/game/world/sector-client.js', import.meta.url), 'utf8');
  const worker = readFileSync(new URL('../src/game/world/sector-worker.js', import.meta.url), 'utf8');
  ok(/advLight: advLight\(\)/.test(client), 'the bake message carries advLight');
  ok(/setAdvLight\(!!message\.advLight\)/.test(worker), 'the Worker sets it before baking');
  ok(worker.indexOf('setAdvLight') < worker.indexOf("import('../world.js')"), '...before world.js loads');
}

adv.setAdvLight(null); adv.setBrowserDefault(null);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
