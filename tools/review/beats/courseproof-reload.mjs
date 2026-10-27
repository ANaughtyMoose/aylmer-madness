// [w8-courseproof] Part B of the course proof, after the plan's second boot (a page
// reload in the same tab: the review namespace is cleared once per tab, so part A's
// records, ghost and save are still there). Checks: the picker row keeps « ton record »,
// the ghost comes back on a new run, Crash Night's record shows in its tab, the saved
// summer still has the church shortcut.
import { closeCards, until } from './courseproof.mjs';

const J = (o) => JSON.parse(JSON.stringify(o ?? null));
const pickerText = (page) => page.evaluate(`(document.getElementById('modepick')?.innerText || '').slice(0, 3000)`);
async function pickerTab(page, want) {
  for (let i = 0; i < 8; i++) {
    const t = await pickerText(page);
    if (want.test(t)) return t;
    await page.evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', key: 'ArrowRight' })), 1`);
    await page.sleep(500);
  }
  return pickerText(page);
}

export async function run(page, assert) {
  const { evaluate, shot, sleep, say, tap } = page;
  const id = page.beat.course || 'bz_vieux';
  const out = {};
  if (await evaluate('!!window.AYLMER.job()')) { await evaluate('window.AYLMER.abandon()'); await sleep(1200); await closeCards(page); }
  if (page.beat.only === 'shortcut') return savedShortcut(page, assert, out);

  // ---- picker: Blitz row keeps « ton record », Crash Night tab shows its record
  await evaluate('window.AYLMER.openModes(true)');
  await sleep(1200);
  const blitz = await pickerTab(page, /Raccourci du Curé/);
  await shot('cpr-picker-blitz');
  out.blitzRow = (blitz.split('\n').find((l) => /ton record/.test(l) && /Bancroft|Principale/.test(l)) || blitz.split('\n').filter((l) => /ton record/.test(l))[0] || '').trim();
  const crash = await pickerTab(page, /Tôle froissée|ton record [\d\s ]+\$/);
  await shot('cpr-picker-crashnight');
  out.crashRow = (crash.split('\n').find((l) => /Bronze .*\$.*ton record/.test(l)) || '').trim();
  await evaluate('window.AYLMER.openModes(false)');
  await sleep(500);
  out.records = { course: J(await evaluate(`import('/src/game/save.js').then((m) => m.loadRecord(${JSON.stringify(id)}))`)), crash: J(await evaluate('window.AYLMER.crashNight.records()')) };
  say('  reload: ' + JSON.stringify(out).slice(0, 600));
  assert(/ton record \d/.test(out.blitzRow), `picker keeps « ton record » after the reload (« ${out.blitzRow} »)`);
  assert(/ton record \d[^a-z]*\$/.test(out.crashRow), `Crash Night tab shows the record after the reload (« ${out.crashRow} »)`);
  assert(out.records.crash && out.records.crash.t != null, 'Crash Night record survives the reload');

  // ---- the ghost after the reload
  out.ghostBefore = J(await evaluate('window.AYLMER.ghost()'));
  assert(await evaluate(`window.AYLMER.course(${JSON.stringify(id)})`), 'course starts again from the picker hook');
  await sleep(1500);
  await closeCards(page);
  for (let i = 0; i < 12; i++) {
    const g = await evaluate('window.AYLMER.qa.gate()');
    if (g && g.kind === 'race') break;
    await tap('KeyE');
    await until(page, 'window.AYLMER.qa.gate() && window.AYLMER.qa.gate().kind === "race"', { gameS: 4, wallS: 60 });
  }
  await until(page, '(window.AYLMER.qa.gate() || {}).going', { gameS: 10, wallS: 300 });
  await evaluate('window.AYLMER.qa.follow({ kmh: 150 })');
  await until(page, '(window.AYLMER.qa.gate() || {}).raceT >= 2.5', { gameS: 20, wallS: 600, every: 200 });
  out.ghostAfter = J(await evaluate('window.AYLMER.ghost()'));
  await shot('cpr-ghost-after-reload');
  await evaluate('window.AYLMER.qa.follow(null)');
  await evaluate('window.AYLMER.abandon()');
  await sleep(1200);
  await closeCards(page);
  assert(out.ghostAfter && out.ghostAfter.loaded && out.ghostAfter.id === id, `the ghost is back after the reload (${JSON.stringify(out.ghostAfter)})`);

  return savedShortcut(page, assert, out);
}

async function savedShortcut(page, assert, out) {
  const { evaluate, shot, sleep, tap } = page;
  // ---- the saved summer keeps the church shortcut
  const slot = page.beat.slot || await evaluate(`(() => { const r = window.AYLMER.slots().find((x) => !x.empty && !x.corrupt && !/auto/.test(x.slot || '')); return r ? (r.slot || r.id) : null; })()`);
  out.slot = slot;
  out.slots = J(await evaluate('window.AYLMER.slots().filter((r) => !r.empty).map((r) => r.slot)'));
  out.shortcutsBeforeLoad = J(await evaluate('window.AYLMER.shortcuts().found'));
  const loaded = slot ? await evaluate(`!!window.AYLMER.load(${JSON.stringify(slot)})`) : false;
  await until(page, 'window.AYLMER.G.mode === "drive"', { gameS: 60, wallS: 600 });
  await sleep(2000);
  await closeCards(page);
  out.shortcutsAfterLoad = J(await evaluate('window.AYLMER.shortcuts()'));
  await tap('Escape'); await sleep(1500);
  const pauseText = await evaluate(`(document.getElementById('pause')?.innerText || document.querySelector('[id*="pause"]:not(.hidden)')?.innerText || '').slice(0, 1500)`);
  out.pauseLine = (pauseText.match(/Raccourcis?[^\n]*/i) || [''])[0];
  await shot('cpr-pause-after-load');
  await tap('Escape'); await sleep(800);
  assert(loaded, `slot ${slot} loads`);
  assert(out.shortcutsAfterLoad && out.shortcutsAfterLoad.found.includes('sc_eglise'), 'the church shortcut survives save, reload, load');
  assert(/Raccourcis\s*1\s*\/\s*4/i.test(pauseText), `pause line « Raccourcis 1/4 » after the load (« ${out.pauseLine} »)`);
  return out;
}
