// Where a mission starts and stops:  node tools/smoke_levels.mjs
//
// W9-LEVELS (27 Oct 2026). Tom on release 3: « it's not clear where the levels
// start and stop anymore ». What has to stay true (docs/qa/rf/W9-LEVELS.md):
//
//   1. Every story mission (the ten and the finale) fires a start card with
//      its number, or, where no card may follow (L'alternateur after the
//      opening or « Été 2004 »), a start banner with the number, the title and
//      the first objective.
//   2. Every story mission fires an end card that names it and the one next
//      mission, and nothing about it is left in the toast queue to come up
//      after the card closes.
//   3. A side job, a course, a challenge and a score mode never read as a
//      story mission.
//
// main.js touches `document` on line one, so the wiring is pinned in its text;
// the decisions themselves are run for real out of src/game/missionframe.js.
import fs from 'node:fs';
import { ALL_MISSIONS, unlockArc, resetArcSync } from '../src/game/missions.js';
import * as C from '../src/game/campaign.js';
import * as F from '../src/game/missionframe.js';
import { PLACES } from '../src/game/places.js';

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? '  :: ' + extra : '')); }
};
const group = (n) => console.log('\n' + n);
const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const DASH = /[\u2013\u2014]/;
const byId = (id) => ALL_MISSIONS.find((d) => d.id === id);
const has = (id) => !!byId(id);
const TOTAL = C.mainStepsTotal(has);

// Every story mission this build plays, in order, then the finale.
const STORY = [...C.mainIds(has), C.FINALE].filter(has).map(byId);
const firstObjective = (def) => {
  try {
    const st = def.build({ carId: 'ranger', carName: 'Ranger', seats: 2, places: [], money: 0 });
    return st && st[0] && st[0].text ? st[0].text : null;
  } catch { return null; }
};
const all = [];   // every string this file saw come out of missionframe, for the dash check

// ---------------------------------------------------------------- 0. the set
group('0. the story missions');
ok(TOTAL === 10, 'ten story steps in this build', TOTAL);
ok(STORY.length >= 11, 'every main id plus the finale exists', STORY.map((d) => d.id).join(' '));
ok(STORY[0].id === 'alternateur' && STORY[STORY.length - 1].id === C.FINALE, 'from L’alternateur to Le dernier soir');
for (const def of STORY) ok(F.isStoryKind(F.frameKind(def)), `${def.id} is a story mission`, F.frameKind(def));

// ---------------------------------------------------------------- 1. start
group('1. every story mission fires a start card (or, with no card, a start banner)');
for (const def of STORY) {
  const n = C.stepOf(def.id);
  const fr = F.startEyebrow(def, false), en = F.startEyebrow(def, true);
  all.push(fr, en);
  if (def.id === C.FINALE) ok(fr === 'DERNIÈRE MISSION' && en === 'LAST MISSION', `${def.id}: card eyebrow « ${fr} »`);
  else ok(fr === `MISSION ${n} SUR ${TOTAL}` && en === `MISSION ${n} OF ${TOTAL}`, `${def.id}: card eyebrow « ${fr} »`, en);
  const obj = firstObjective(def) || 'Objectif';
  const b = F.startBanner(def, obj, false), be = F.startBanner(def, obj, true);
  all.push(b, be);
  ok(!!b && b.startsWith(fr + ' : ') && b.includes(String(def.title).toUpperCase()), `${def.id}: banner names it`, b);
  ok(!!b && b.split('\n').length === 2 && b.split('\n')[1] === obj, `${def.id}: banner is two lines, the second the first objective`, b);
  ok(!!be && be.startsWith(en + ' : '), `${def.id}: English banner`, be);
}
{
  const alt = byId('alternateur');
  const obj = firstObjective(alt);
  ok(!!obj, 'L’alternateur builds its first stage', obj);
  ok(F.startBanner(alt, obj, false).startsWith('MISSION 1 SUR 10 : L’ALTERNATEUR\n'), 'the card-less mission 1 gets « MISSION 1 SUR 10 : L’ALTERNATEUR »', F.startBanner(alt, obj, false));
  ok(F.BANNER_MS >= 2500 && F.BANNER_MS <= 4000, 'the banner is brief (2.5 to 4 s)', F.BANNER_MS);
}

// ---------------------------------------------------------------- 2. end
group('2. every story mission fires an end card that names it and the next one');
{
  const done = new Set();
  for (let i = 0; i < STORY.length; i++) {
    const def = STORY[i];
    const n = C.stepOf(def.id);
    ok(F.endsOnCard(def, false), `${def.id}: ends on a card`);
    const fr = F.endEyebrow(def, false), en = F.endEyebrow(def, true);
    all.push(fr, en);
    if (def.id === C.FINALE) ok(fr === 'DERNIÈRE MISSION TERMINÉE' && en === 'LAST MISSION COMPLETE', `${def.id}: « ${fr} »`);
    else ok(fr === `MISSION ${n} SUR ${TOTAL} TERMINÉE` && en === `MISSION ${n} OF ${TOTAL} COMPLETE`, `${def.id}: « ${fr} »`, en);
    done.add(def.id);
    const next = F.nextLine(done, false), nextEn = F.nextLine(done, true);
    all.push(next, nextEn);
    const want = STORY.find((d) => !done.has(d.id) && (C.isMain(d.id) || (d.id === C.FINALE && C.allMainDone(done, has))));
    if (def.id === C.FINALE) ok(next === '' && nextEn === '', 'after the finale: no next line');
    else {
      const p = PLACES[want.giver];
      ok(next.startsWith('Prochaine mission : ' + want.title), `${def.id}: next is « ${want.title} »`, next);
      ok(!p || !p.label || next.endsWith('  ·  ' + p.label), `${def.id}: and where it starts`, next);
      ok(nextEn.startsWith('Next mission: ' + want.title), `${def.id}: English next line`, nextEn);
    }
  }
  ok(F.endEyebrow(byId('sayyad'), false, 'OR') === 'MISSION 2 SUR 10 TERMINÉE · OR', 'a medal rides after the mission');
  ok(!F.endsOnCard(byId('sayyad'), true), 'the summer ending on it: the ending cards take over');
}

// ---------------------------------------------------------------- 3. not the story
group('3. side jobs, courses, challenges and score modes never read as the story');
{
  const side = Object.keys(C.OPTIONAL).filter(has).map(byId);
  ok(side.length >= 5, 'the optional jobs exist', side.length);
  for (const def of side) {
    ok(F.frameKind(def) === 'job' && F.startEyebrow(def) === 'JOB À CÔTÉ' && F.startEyebrow(def, true) === 'SIDE JOB', `${def.id}: « JOB À CÔTÉ »`);
    ok(F.endsOnCard(def, false) && F.endEyebrow(def) === 'JOB TERMINÉE', `${def.id}: ends on « JOB TERMINÉE »`);
    ok(F.startBanner(def, 'x') === null, `${def.id}: no story banner`);
  }
  const M = await import('../src/game/modes.js');
  for (const c of M.COURSES.slice(0, 4)) {
    const def = M.missionFor(c);
    ok(F.frameKind(def) === 'course' && F.startEyebrow(def) === 'COURSE LIBRE · HORS HISTOIRE', `${c.id}: « COURSE LIBRE · HORS HISTOIRE »`, F.frameKind(def));
    ok(!F.endsOnCard(def, false), `${c.id}: ends on its FINI toast, so R works at once`);
    ok(F.startBanner(def, 'x') === null, `${c.id}: no story banner on a rerun`);
  }
  const ch = { id: 'ambush', title: 'Course: Sayyad', mode: 'ambush' };
  ok(F.frameKind(ch) === 'challenge' && F.startEyebrow(ch) === 'DÉFI · HORS HISTOIRE' && !F.endsOnCard(ch), 'a street challenge: « DÉFI · HORS HISTOIRE », no end card');
  const sc = { id: 'crashnight', title: 'Tôle froissée', mode: 'crashnight', result: () => null };
  ok(F.frameKind(sc) === 'score' && !F.endsOnCard(sc), 'a score mode ends on its own result');
  for (const d of [...side, ch, sc]) for (const en of [false, true]) { const e = F.startEyebrow(d, en); all.push(e); ok(!/^MISSION|^LAST MISSION|^DERNIÈRE/.test(e), `${d.id}: eyebrow is not a mission number`, e); }
  const modes = read('src/game/modes.js');
  ok(/toast\('BALADE · HORS HISTOIRE\\n/.test(modes), 'M, Balade: the toast says it is outside the story');
}

// ---------------------------------------------------------------- 4. main.js wiring
group('4. main.js asks missionframe at every start and end');
{
  const MAIN = read('src/main.js');
  const body = (name) => { const i = MAIN.indexOf(`function ${name}(`); const j = MAIN.indexOf('\n}\n', i); return i < 0 ? '' : MAIN.slice(i, j < 0 ? undefined : j); };
  const start = body('startMission');
  ok(/cinema\.show\(\{ eyebrow: startEyebrow\(def, en\), title: def\.title/.test(start), 'the brief card carries the mission eyebrow');
  ok(/const banner = opts\.card === false \? startBanner\(def, stages\[0\]\.text, en\) : null;/.test(start), 'no card: the story banner from the first stage');
  ok(/else if \(banner\) holdBanner\(banner, castThenLines\);\n\s*else castThenLines\(\);/.test(start), '...and the friends’ start lines wait for it');
  const hold = body('holdBanner'), tick = body('tickBanner');
  ok(/hud\.toast\(text, BANNER_MS, true\)/.test(hold), 'the banner is one toast in the front slot');
  ok(/if \(b\.skip\) hud\.dropToast\(b\.text\);/.test(tick) && /b\.then\(\);/.test(tick), 'Enter takes it down and the lines go on');
  ok(/if \(!G\.mission \|\| G\.mission\.def !== b\.def\) \{ startBannerHold = null; return; \}/.test(tick), 'a job that is gone takes its banner with it');
  ok(/tickBanner\(dt\);/.test(body('updateMission')), 'ticked on game time in updateMission');
  ok(/if \(startBannerHold && input\.hit\('Enter'\)\) startBannerHold\.skip = true;/.test(body('handleKeys')), 'Enter skips it');
  ok(/startBannerHold = null;/.test(body('closeMission')), 'closeMission drops it');
  // Both card-less starts are L'alternateur, a story mission, so both get the banner.
  const noCard = [...MAIN.matchAll(/startMission\(ALL_MISSIONS\.find\(\(?d\)? => d\.id === '(\w+)'\), \{ card: false \}\)/g)].map((x) => x[1]);
  ok(noCard.length === 2 && noCard.every((id) => F.startBanner(byId(id), 'x') !== null), 'every card-less story start is one the banner covers', noCard.join(' '));

  const upd = body('updateMission');
  ok(/const tail = endsOnCard\(def, G\.summerOver\) \? \[\] : null;/.test(upd), 'the end decides card or toast once');
  ok(/if \(u\.toast\) \{ if \(tail\) tail\.push\(u\.toast\); else hud\.toast\(u\.toast, 3600\); \}/.test(upd), 'a lent car goes on the card, not the queue');
  ok(/if \(!tail\) hud\.toast\(finiText, 4600\);/.test(upd), 'FINI is toasted only when no card says it');
  const a = upd.indexOf('endSink = tail;'), b = upd.indexOf('endOfJob(def);'), c = upd.indexOf('endSink = null;');
  ok(a > 0 && a < b && b < c, 'the new day is caught for the card around endOfJob');
  ok(/calendar\.spendDay\(G, endSink \? \{ toast: \(t\) => endSink\.push\(t\) \} : hud\)/.test(body('endOfJob')), 'endOfJob hands the day toast to the sink');
  ok(/if \(tail && endsOnCard\(def, G\.summerOver\)\) cinema\.show\(\{/.test(upd), 'the end card shows for every job that ends on one');
  ok(/eyebrow: endEyebrow\(def, medalEn, medal \? medalEyebrow\(medal, medalEn\) : ''\)/.test(upd), 'its eyebrow names the mission');
  ok(/\(tail\.length \? '\\n' \+ tail\.join\('\\n'\) : ''\)/.test(upd) && /nextLine\(G\.done, medalEn\)/.test(upd), 'the card carries the lent car, the day and the next mission');
  ok(/if \(tail\) \{ hud\.toast\(finiText, 4600\); for \(const t of tail\) hud\.toast\(t, 3600\); \}/.test(upd), 'no card after all (summer over): the same lines as toasts');
  ok(/dropToast\(text\)/.test(read('src/game/hud.js')), 'hud.dropToast exists');
  // Wave 9 cloud QA: « NOUVELLE JOB » came up after L'alternateur's end card, repeating its next line.
  const q = upd.indexOf('unlockArc(G, { quiet: true });'), sh = upd.indexOf('if (tail && endsOnCard(def, G.summerOver)) cinema.show({');
  ok(q > 0 && q < sh && /if \(tail && endsOnCard\(def, G\.summerOver\)\) unlockArc\(G, \{ quiet: true \}\);/.test(upd), 'the arc is synced quietly before the end card, so no NOUVELLE JOB toast follows it');

}

// ---------------------------------------------------------------- 4b. the quiet arc sync
group('4b. a job that ends on its card leaves no « NOUVELLE JOB » toast behind');
{
  const toasts = [];
  const G = { done: new Set(), day: 0, hud: { toast: (t) => toasts.push(t) }, audio: { chime() {} } };
  resetArcSync();
  unlockArc(G);                                  // first sync of a save: silent
  G.done.add('alternateur');
  const quiet = unlockArc(G, { quiet: true });   // main.js, as the end card goes up
  ok(quiet.length === 1 && quiet[0].id === 'sayyad', 'the quiet sync still opens the next mission', quiet.map((d) => d.id).join(' '));
  ok(toasts.length === 0, 'and toasts nothing', toasts.join(' | '));
  ok(unlockArc(G).length === 0 && toasts.length === 0, 'the per-frame call after it has nothing left to announce');
  G.done.add('sayyad');
  ok(unlockArc(G).length === 1 && /^NOUVELLE JOB/.test(toasts[0] || ''), 'without the quiet flag it still announces (summer-over path, no card)', toasts.join(' | '));
  resetArcSync();
}

// ---------------------------------------------------------------- 4c. the card fits a short window
group('4c. a short window gets the tight card (wave 9 cloud QA, 800x500)');
{
  const css = read('cinematic.css');
  const m = css.match(/@media\(max-height:620px\) and \(min-width:701px\)\{([^\n]*)\}/);
  ok(!!m, 'cinematic.css has the max-height 620 rule');
  ok(!!m && /\.cinema-task\{font-size:15px/.test(m[1]) && /#cinema-title\{font-size:28px/.test(m[1]) && /\.cinema-copy\{padding:18px 28px\}/.test(m[1]), '...that tightens the copy, the title and the task');
}

// ---------------------------------------------------------------- 5. text rules
group('5. text');
ok(!all.some((x) => DASH.test(x || '')), 'no em or en dash in any frame text', all.filter((x) => DASH.test(x || '')).join(' | '));
ok(!DASH.test(read('src/game/missionframe.js')), 'none in missionframe.js either');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
