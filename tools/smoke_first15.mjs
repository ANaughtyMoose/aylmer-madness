// The first fifteen minutes:  node tools/smoke_first15.mjs
//
// W8-FIRST15 (27 Oct 2026; pressure check risk 3, redteam FIRST-15). The
// opening sagged at 2:35 to 5:00. What has to stay true:
//
//   1. L'alternateur's way home has something to aim at: Maman's soft record
//      (a time to beat, never a fail; the job stays untimed) and a slide zone
//      at the last sharp corner of the GPS line.
//   2. At first control the key legend pill and the FRÔLÉS / CASSÉS counters
//      wait for the first natural moment (near miss, smash, tutorial end); ?
//      still opens the legend.
//   3. One « next » in the first driveways (only Sayyad's pillar is new after
//      the first errand, the line names the next main mission until the
//      Saint-Jean is done, no « Z : dormir »), and no date lock before mission
//      3 on any difficulty. The Saint-Jean stays on 24 June.
import fs from 'node:fs';
import {
  ALL_MISSIONS, missionById, missionAvailable, missionLockReason, availableMissions, nextMission,
  homeLeg, mamanTime, MAMAN_T, MAMAN_LINES, LEG_BEST, lastCorner, slideZoneTick, SLIDE, SLIDE_LINES,
  FIRST_RAMP,
} from '../src/game/missions.js';
import * as C from '../src/game/campaign.js';
import * as CAL from '../src/game/calendar.js';
import * as S from '../src/game/summer.js';
import { freeRoamLines, earlyNext } from '../src/game/story.js';
import { hudCalm } from '../src/game/ui.js';
import { PLACES } from '../src/game/places.js';

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name + (extra !== undefined ? '   ' + extra : '')); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  - ' + JSON.stringify(extra) : '')); }
};
const group = (n) => console.log('\n' + n);
const read = (rel) => fs.readFileSync(new URL('../' + rel, import.meta.url), 'utf8');
const DASH = /[\u2013\u2014]/;
const byId = (id) => ALL_MISSIONS.find((d) => d.id === id);
const home = PLACES.home;

function newG(difficulty = 'normal', proto = false) {
  const G = { done: new Set(), difficulty, settings: { lang: 'fr' }, prototype2004: proto,
    veh: { x: home.x, z: home.z, speedKmh: 0, vLong: 0, spec: { id: 'ranger' } }, parked: {} };
  CAL.startSummer(G);
  return G;
}
const play = (G, id) => { G.done.add(id); CAL.spendDay(G, null); };

// ---------------------------------------------------------------- 3. days
group('3a. no date lock and no sleep line before mission 3, on any difficulty');
ok(CAL.WHOLE_DAYS_UNTIL === C.SAINT_JEAN_DAY, 'calendar.js and campaign.js agree on the Saint-Jean day', CAL.WHOLE_DAYS_UNTIL);
ok(C.DATE_GATES.arcbache === C.SAINT_JEAN_DAY && CAL.label(C.SAINT_JEAN_DAY) === 'jeu 24 juin', 'the bonfire stays on 24 June');
ok(CAL.DIFF.easy.dayCost === 0.5, 'easy still spends half days (from the 24th)');
for (const diff of ['easy', 'normal', 'hard']) {
  const G = newG(diff);
  play(G, 'alternateur');
  play(G, 'sayyad');
  const sj = byId('arcbache');
  ok(missionAvailable(G, sj), `${diff}: the Saint-Jean is open right after Sayyad (day ${G.day})`, missionLockReason(G, sj));
  ok(S.storyWaiting(G) === null, `${diff}: the story is not waiting on a date`);
  ok(S.sleepHint(G) === '', `${diff}: no « Z : dormir » in the driveway`, S.sleepHint(G));
  ok(S.nextStoryNote(G) === '', `${diff}: no « Prochaine histoire » on Sayyad's end card`);
}
{
  const E = newG('easy');
  CAL.spendDay(E, null); CAL.spendDay(E, null);
  ok(E.day === 2, 'easy: two jobs are two whole days before the 24th', E.day);
  CAL.spendDay(E, null);
  ok(E.day === 2.5, 'easy: and half a day from the 24th on', E.day);
  const late = newG('easy'); late.day = 1.5; CAL.spendDay(late, null);
  ok(late.day === 2.5, 'an old easy save at 1.5 lands past the date, never short of it', late.day);
}
{
  // A story-only easy player is never asked to sleep before mission 3.
  const G = newG('easy');
  let sleeps = 0;
  for (let guard = 0; guard < 10 && !G.done.has('arcbache'); guard++) {
    const d = nextMission(G);
    if (d && missionAvailable(G, d)) play(G, d.id); else { sleeps++; S.applySleep(G, S.planSleep(G)); }
  }
  ok(G.done.has('arcbache') && sleeps === 0, 'easy, story only: three missions, no sleep', { sleeps, day: G.day });
}

group('3b. one « next » in the first driveways (index.html)');
{
  const G = newG();
  play(G, 'alternateur');
  ok(C.quietStart(G) && C.earlyStory(G), 'after the first errand: quiet start, early story');
  const fresh = availableMissions(G).filter((d) => !G.done.has(d.id)).map((d) => d.id);
  ok(fresh.length === 1 && fresh[0] === 'sayyad', 'the only new pillar is Sayyad’s', fresh.join(' '));
  for (const id of ['dep', 'margaretdental']) {
    ok(/Réveiller Sayyad/.test(missionLockReason(G, byId(id)) || ''), `${id} waits for Sayyad, and says so`, missionLockReason(G, byId(id)));
  }
  const l = freeRoamLines(G);
  ok(l.kind === 'job' && l.text.includes(byId('sayyad').title), 'the line names Sayyad’s job', l.text);
  ok(S.sleepHint(G) === '', 'and no sleep line while parked at home');
  const src = read('src/game/economy.js');
  ok(/k === 'home' && quietStart\(G\)/.test(src), 'no « K : Kijiji » hint at home before Sayyad (K still works)');
  const main = read('src/main.js');
  ok(/if \(quiet && G\.done\.has\(d\.id\)\) return false;/.test(main), 'the home pillar offers no « (déjà fait) » replay before Sayyad');

  play(G, 'sayyad');
  ok(!C.quietStart(G) && C.earlyStory(G), 'after Sayyad: optional jobs open, still early story');
  ok(missionAvailable(G, byId('dep')) && missionAvailable(G, byId('margaretdental')), 'Dr Morin and the yogurt are open now');
  const atHome = freeRoamLines(G);
  ok(atHome.kind === 'job' && atHome.text.includes(byId('arcbache').title),
    'standing on Dr Morin’s pillar, the line still names the Saint-Jean', atHome.text);
  ok(earlyNext(G) && earlyNext(G).def.id === 'arcbache', 'earlyNext is the next main mission');
  play(G, 'arcbache');
  ok(!C.earlyStory(G) && earlyNext(G) === null, 'after the Saint-Jean, the nearest job leads again');
}
{
  // The prototype has hour windows: its optional jobs must not wait for Sayyad.
  const P = newG('normal', true);
  P.done.add('alternateur');
  ok(!C.quietStart(P) && !C.earlyStory(P), 'prototype: no quiet start');
  ok(!/Sayyad/.test(missionLockReason(P, byId('dep')) || ''), 'prototype: the yogurt is not held for Sayyad', missionLockReason(P, byId('dep')));
}

// ---------------------------------------------------------------- 2. HUD
group('2. a calm HUD at first control');
{
  const G = { stats: { nearMiss: 0, propsSmashed: 0 }, done: new Set() };
  ok(hudCalm(G, false) === true, 'new player, nothing happened: calm');
  ok(hudCalm(G, false) === true, 'still calm a frame later');
  G.stats.nearMiss = 1;
  ok(hudCalm(G, false) === false, 'first near miss: the legend pill and counters come up');
  G.stats.nearMiss = 0;
  ok(hudCalm(G, false) === false, 'and stay up (latched)');
  ok(hudCalm({ stats: { propsSmashed: 1 }, done: new Set() }, false) === false, 'a smash counts too');
  ok(hudCalm({ stats: { styleNear: 2 }, done: new Set() }, false) === false, 'a traffic near miss counts too');
  ok(hudCalm({ stats: {}, done: new Set() }, true) === false, 'tutorial already done: never calm');
  ok(hudCalm({ stats: {}, done: new Set(['alternateur']) }, false) === false, 'a save with a job done: never calm');
  ok(hudCalm(null, false) === false, 'no G: not calm');
  const css = read('style.css');
  ok(/#legend\.held\.collapsed\{display:none\}/.test(css), 'CSS hides only the folded pill while held');
  ok(!/#legend\.held\{/.test(css) && !/#legend\.held #legendrows/.test(css), 'an open legend is never hidden (? still opens it)');
  const ui = read('src/game/ui.js');
  ok(/setHeld\(on\)/.test(ui) && /if \(on === this\.held\) return;/.test(ui), 'Legend.setHeld touches the DOM only on a change');
  ok(/const on = !!G\.mission && !G\.hudCalm;/.test(read('src/game/reactive.js')), 'the job counters wait too');
  const main = read('src/main.js');
  const at = main.indexOf('G.hudCalm = hudCalm(G, tutorial.finished);');
  ok(at > 0 && at < main.indexOf('if (G.reactive) G.reactive.update(dt, G);'), 'set every frame, before the counters paint');
  ok(/if \(input\.hit\('Legend'\)\) legend\.toggle\(\);/.test(main), 'the legend key still toggles it');
  ok(!/prends ton temps', 2600\)/.test(main), 'no « prends ton temps » toast at first control');
  ok(/\? affiche les commandes/.test(missionById('alternateur').build({ carName: 'Ranger' })[0].sub), 'stage 1 tells you ? shows the controls');
}

// ---------------------------------------------------------------- 1. home leg
group('1a. Maman’s time on the way home: a record, never a fail');
{
  const st = missionById('alternateur').build({ carId: 'ranger', carName: 'Ranger', seats: 2 });
  ok(st[0].time == null && st[1].time == null, 'the job stays untimed (Tom: a driving lesson)');
  ok(st[1].softClock === true && !st[0].softClock, 'stage 2 only has the soft clock');
  ok(MAMAN_T === 130 && mamanTime({}) === 130, 'Maman: 2:10 on normal');
  ok(mamanTime({ timerScale: 1.4 }) === 182 && mamanTime({ timerScale: 0.9 }) === 117, 'scaled like every story clock (easy 3:02, hard 1:57)');
  const G = { veh: { x: 0, z: 0, yaw: 0, speedKmh: 50 }, hud: { toast() {} }, settings: { lang: 'fr' } };
  const m = {};
  st[1].onEnter(G, m, st[1]);
  let fails = 0;
  for (let i = 0; i < 60 * 200; i++) { const r = st[1].onTick(G, m, st[1], 1 / 60); if (r) fails++; }
  ok(fails === 0 && Math.abs(m.legT - 200) < 0.05, 'two hundred seconds past Maman’s time: nothing fails', m.legT.toFixed(2));
  const slow = homeLeg(G, m);
  ok(!slow.beat && slow.line === MAMAN_LINES.miss('3:20'), 'over her time: « I said straight back, Tom. »', slow.line);
  ok(slow.task === 'Retour 3:20  ·  Maman 2:10', 'the end card line', slow.task);
  ok(G.best[LEG_BEST] === 200, 'the first run is your best for the leg');
  const fast = homeLeg(G, { legT: 121 });
  ok(fast.beat && fast.record && /Faster than I said/.test(fast.line), 'under her time: she says so', fast.line);
  ok(fast.task === 'Retour 2:01  ·  Maman 2:10  ·  battue  ·  nouveau record perso', 'a beaten time and a new best', fast.task);
  const again = homeLeg(G, { legT: 125, slid: 1 });
  ok(!again.record && again.task.endsWith('ton record 2:01  ·  coin glissé'), 'a replay names your best, and the slide', again.task);
  const en = homeLeg({ settings: { lang: 'en' } }, { legT: 100 });
  ok(en.task === 'Home leg 1:40  ·  Mom 2:10  ·  beaten', 'English HUD', en.task);
  ok(![...Object.values(MAMAN_LINES).map((f) => f('2:00')), slow.task, fast.task, en.task].some((x) => DASH.test(x)), 'no em or en dash');
  ok(/^« .* »$/.test(MAMAN_LINES.beat('2:00')) && /Tom/.test(MAMAN_LINES.miss('2:00')), 'Margaret speaks English (main cast)');
  const main = read('src/main.js');
  ok(/else if \(st\.softClock\) hud\.setSoftClock\(/.test(main), 'main.js paints it in the clock slot');
  ok(/Maman chronomètre le retour/.test(main) && !/note: 'Aucun chrono\. Prends ton temps\.'/.test(main),
    'the « C’est dans la boîte » card says Maman is timing, not « prends ton temps »');
  ok(/heckle\.line\('Margaret', leg\.line/.test(main), 'Margaret says it at the door');
  const hud = read('src/game/hud.js');
  ok(/setSoftClock\(seconds, target, en = false\)/.test(hud) && /if \(key === this\._softKey\) return;/.test(hud), 'the soft clock repaints once a second, not every frame');
  ok(/#timer\.soft\{/.test(read('style.css')) && !/#timer\.soft[^{]*\{[^}]*ff5f4d/.test(read('style.css')), 'dim, never red');
}

group('1b. the slide zone: the last sharp corner of the line home');
{
  // East 300 m, then north 400 m to the door: the corner is the turn.
  const route = [];
  for (let x = 0; x <= 300; x += 20) route.push([x, 0]);
  for (let z = 20; z <= 400; z += 20) route.push([300, z]);
  const c = lastCorner(route);
  ok(c && c.x === 300 && c.z === 0, 'a right angle 400 m from the end', c);
  // A curve in short segments still reads as one corner.
  const arc = [];
  for (let x = 0; x <= 200; x += 20) arc.push([x, 0]);
  for (let k = 1; k < 8; k++) { const a = (k / 8) * Math.PI / 2; arc.push([200 + 10 * Math.sin(a), 10 - 10 * Math.cos(a)]); }
  for (let z = 10; z <= 300; z += 20) arc.push([210, z]);
  ok(!!lastCorner(arc), 'a tight curve drawn in 2 m segments is a corner');
  ok(lastCorner([[0, 0], [500, 0], [500, 30]]) === null, 'a turn in the last 60 m (the driveway) is not');
  ok(lastCorner([[0, 0], [0, 100], [5, 400], [10, 700]]) === null, 'a straight road has none');
  ok(lastCorner(null) === null && lastCorner([[0, 0]]) === null, 'no route, no corner');

  const toasts = [];
  const G = { veh: { x: 0, z: 0, speedKmh: 50, yawRate: 0 }, route, input: { handbrake: false }, hud: { toast: (t) => toasts.push(t) }, settings: { lang: 'fr' } };
  const m = {};
  ok(slideZoneTick(G, m) === null, 'far off: nothing');
  G.veh.x = 300 - SLIDE.callD + 10;
  ok(slideZoneTick(G, m) === SLIDE_LINES.call[0] && slideZoneTick(G, m) === null, 'called once as you come up to it');
  G.veh.x = 295; G.veh.yawRate = 1.2;
  ok(slideZoneTick(G, m) === null, 'turning without the handbrake is not a slide');
  G.input.handbrake = true; G.veh.speedKmh = 10;
  ok(slideZoneTick(G, m) === null, 'nor a handbrake at walking pace');
  G.veh.speedKmh = 45;
  ok(slideZoneTick(G, m) === SLIDE_LINES.done[0] && m.slid === 1, 'a handbrake slide through it gets its line');
  ok(slideZoneTick(G, m) === null && toasts.length === 2, 'once');
  ok(![...SLIDE_LINES.call, ...SLIDE_LINES.done].some((x) => DASH.test(x)), 'no em or en dash');
  ok(slideZoneTick({ veh: null }, {}) === null && slideZoneTick({ veh: { x: 0, z: 0 } }, {}) === null, 'no car or no route: no crash');

  // The real line home: same router as main.js. The corner is the turn off
  // chemin d'Aylmer onto Fraser, just east of the garnotte ramp's west face.
  const { Nav } = await import('../src/game/nav.js');
  const { JUMPS } = await import('../src/game/jumps.js');
  const nav = new Nav();
  const back = nav.route(PLACES.ctire.x, PLACES.ctire.z, home.x, home.z) || [];
  const rc = lastCorner(back);
  const ramp = JUMPS.find((j) => j.id === FIRST_RAMP);
  ok(back.length > 10 && !!rc, 'the real way home has a last corner', back.length);
  if (rc && ramp) {
    const dr = Math.hypot(rc.x - ramp.x, rc.z - ramp.z), dh = Math.hypot(rc.x - home.x, rc.z - home.z);
    ok(dr > 20 && dr < 160, 'it is the Fraser corner, just past the ramp', `${dr.toFixed(0)} m from the ramp, ${dh.toFixed(0)} m from the door`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
