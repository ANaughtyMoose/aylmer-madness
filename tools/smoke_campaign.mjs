// The summer's story as data:  node tools/smoke_campaign.mjs
//
// Restructure (29 Sept 2026, docs/STORY-REBUILD.md s.0; Tom's approved plan in
// docs/design/MAIN-STORY-PROPOSAL.md with the ledger's 29 Sept changes):
// ten main missions in order, each gated on the one before; the finale opens
// when the ten are done or on Labour Day; optional jobs open with the main
// mission that introduces their place; twelve cut jobs stay only for old saves;
// the summer runs 22 June to 6 September; the streets counter.
import { strict as assert } from 'node:assert';

const C = await import('../src/game/campaign.js');
const M = await import('../src/game/missions.js');
const W = await import('../src/game/jobwindows.js');
const CAL = await import('../src/game/calendar.js');
const { UNLOCKS } = await import('../src/game/garage.js');
const ST = await import('../src/game/streets.js');
const { STORY_CARDS, endingCards } = await import('../src/game/story.js');

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  — ' + extra : '')); }
};
const group = (n) => console.log('\n' + n);
const has = (id) => M.ALL_MISSIONS.some((d) => d.id === id);
const byId = (id) => M.ALL_MISSIONS.find((d) => d.id === id);
const at = (h) => h / 24 * W.DAY_CYCLE;

group('the ten, in Tom’s order');
{
  ok(C.MAIN.length === 10, `ten main steps (${C.MAIN.length})`);
  ok(C.MAIN.every((s, i) => s.n === i + 1), 'numbered 1 to 10');
  const keys = C.MAIN.map((s) => s.key).join(' ');
  ok(keys === 'alternateur sayyad saintjean divan canot golf sauna tim royal nachos', keys);
  ok(C.MAIN.find((s) => s.key === 'tim').ids.join() === 'nuittim', 'step 8 is « La nuit du Tim »');
  ok(C.FINALE === 'arcdernier' && has(C.FINALE), 'the finale is « Le dernier soir » and exists');
  const missing = C.MAIN.flatMap((s) => s.ids).filter((id) => !has(id));
  ok(true, `main ids not in this build (skipped, never waited on): ${missing.join(', ') || 'none'}`);
  ok(C.mainStepsTotal(has) === C.MAIN.filter((s) => s.ids.some(has)).length, 'the step total counts only playable steps');
  for (const s of C.MAIN) for (const id of s.ids) if (has(id)) ok(C.stepOf(id) === s.n, `${id} is step ${s.n}`);
}

group('each main mission waits for the one before it');
{
  const ids = C.mainIds(has);
  ok(C.nextMain([], has) === 'alternateur', 'a new summer starts on the alternator');
  let wrong = [];
  for (let k = 0; k < ids.length; k++) {
    const done = new Set(ids.slice(0, k));
    for (let j = 0; j < ids.length; j++) {
      const blocker = C.storyBlocker(ids[j], done, has);
      const want = j <= k ? null : ids[k];
      if (blocker !== want) wrong.push(`${ids[j]}@${k}:${blocker}`);
    }
  }
  ok(!wrong.length, 'only the next one opens; finished ones stay open for replays', wrong.slice(0, 4).join(' '));
  const done4 = new Set(ids.slice(0, 4));
  ok(/Finis/.test(M.missionLockReason({ done: done4 }, byId(ids[6])) || ''),
    'a later one says which to finish first', M.missionLockReason({ done: done4 }, byId(ids[6])));
  ok(C.mainStepsDone(done4, has) === 4, 'four steps done');
  ok(M.storyProgress({ done: done4 }).done === 4 && M.storyProgress({ done: done4 }).total === C.mainStepsTotal(has),
    'the pause screen\'s « Histoire : n/10 » reads the same');
}

group('the finale can never be missed');
{
  const ids = C.mainIds(has);
  ok(!C.finaleOpen(new Set(ids.slice(0, 9)), has), 'shut with a main mission left');
  ok(C.finaleOpen(new Set(ids), has), 'open when the ten are done');
  ok(C.finaleOpen(new Set(['alternateur']), has, true), 'and open on Labour Day whatever is left');
  ok(M.missionAvailable({ done: new Set(['alternateur']), day: CAL.LAST }, byId(C.FINALE)), 'missions.js agrees on Labour Day');
  ok(M.missionAvailable({ prototype2004: true, dayClock: at(13), day: 30, done: new Set(ids) }, byId(C.FINALE)),
    'in the prototype the finale never waits on the hour or a date');
}

group('optional jobs open with their place, and stay open');
{
  for (const [id, need] of Object.entries(C.OPTIONAL)) {
    ok(has(id), `${id} exists`);
    ok(C.storyBlocker(id, [], has) === (need === 'alternateur' ? 'alternateur' : need), `${id} waits for ${need}`);
    ok(C.storyBlocker(id, [need], has) === null, `${id} opens once ${need} is done`);
  }
  const optional = M.ALL_MISSIONS.filter((d) => !C.isMain(d.id) && d.id !== C.FINALE).map((d) => d.id);
  ok(optional.every((id) => id in C.OPTIONAL), 'every job outside the ten has a pairing', optional.filter((id) => !(id in C.OPTIONAL)).join(' '));
}

group('D31: the bridge beat is cut, step 7 is the sauna alone, old saves go on');
// Tom, 13 Oct 2026: « none of that radiator shit is remotely real ». The id
// arcsurchauffe is retired with no code left; a save that finished it, or was
// in the middle of it, still loads and still reaches step 8.
{
  const SV = await import('../src/game/save.js');
  const seven = C.MAIN.find((s) => s.n === 7);
  ok(seven.ids.join() === 'stvincent' && seven.name === 'Le sauna de cèdre', 'step 7 is « Le sauna de cèdre », stvincent only', seven.ids.join());
  ok(C.isRetired('arcsurchauffe') && !has('arcsurchauffe'), 'arcsurchauffe is retired and has no live job');
  ok(!C.mainIds(has).includes('arcsurchauffe') && C.stepOf('arcsurchauffe') === 0, '...and is in no step');
  const upToGolf = C.mainIds(has).slice(0, C.mainIds(has).indexOf('golfcart') + 1);
  for (const [label, progress, mission] of [
    ['an old save that finished the bridge', [...upToGolf, 'arcsurchauffe'], null],
    ['an old save in the middle of the bridge', upToGolf, { id: 'arcsurchauffe', stage: 3, elapsed: 120, timeLeft: null, passengers: 1, state: {} }],
  ]) {
    const raw = { ...SV.newSave('d31'), progress, mission };
    const sv = SV.normalizeSave(JSON.parse(JSON.stringify(raw)), 'tom.1');
    ok(!!sv && sv.progress.length === progress.length, `${label}: loads, progress kept as saved (${sv && sv.progress.length})`);
    // main.js resumeMission looks the job up in ALL_MISSIONS; a cut id is not
    // there, so the job is dropped (« Job perdue ») and the player drives free.
    if (mission) ok(sv.mission && sv.mission.id === 'arcsurchauffe' && !M.ALL_MISSIONS.some((d) => d.id === sv.mission.id),
      `${label}: the saved job is read but has no def to resume, so it is dropped`);
    const done = new Set(sv.progress);
    ok(C.mainStepsDone(done, has) === 6, `${label}: six steps done (${C.mainStepsDone(done, has)})`);
    ok(C.nextMain(done, has) === 'stvincent', `${label}: the next main mission is the sauna`, C.nextMain(done, has));
    const G = { done, day: C.DATE_GATES.stvincent };   // S4-SUMMER: the sauna's own date, 30 July
    ok(M.nextMission(G)?.id === 'stvincent', `${label}: the story offers stvincent`, M.nextMission(G)?.id);
    ok(C.storyBlocker('stvincent', done, has) === null, `${label}: stvincent is open`);
    done.add('stvincent');
    ok(C.nextMain(done, has) === 'nuittim' && C.stepOf('nuittim') === 8, `${label}: after the sauna, step 8 (nuittim)`, C.nextMain(done, has));
    ok(C.mainStepsDone(done, has) === 7, `${label}: seven steps done`);
    ok(C.storyBlocker('nuittim', done, has) === null, `${label}: nuittim is open`);
  }
}

group('the cuts stay cut');
{
  ok(C.RETIRED.length === 12, `twelve retired ids (${C.RETIRED.join(' ')})`);
  for (const id of C.RETIRED) {
    ok(!has(id) && !M.MISSIONS.some((d) => d.id === id), `${id} is on no list`);
    ok(C.storyBlocker(id, [], has) === C.RETIRED_TAG, `${id} is refused by the story`);
    ok(/Pas dans cet été-là/.test(M.missionLockReason({ done: new Set() }, { id }) || ''), `${id} says « Pas dans cet été-là »`);
  }
  ok(C.activeDone(['alternateur', 'poutine', 'cv']).join() === 'alternateur', 'an old save\'s retired ids count for nothing');
  ok(C.mainStepsDone(['poutine', 'cv', 'tour'], has) === 0, '…and never as a story step');
  const civic = UNLOCKS.civic;
  ok(civic && civic.mission === 'sayyad' && (civic.legacy || []).includes('poutine'),
    'the Civic comes with « Réveiller Sayyad » and old poutine saves keep it');
}

group('the calendar: 22 June to Labour Day, the Saint-Jean on the 24th');
{
  ok(CAL.label(0) === 'mar 22 juin' && CAL.label(C.SAINT_JEAN_DAY) === 'jeu 24 juin', `day 0 ${CAL.label(0)}, Saint-Jean ${CAL.label(C.SAINT_JEAN_DAY)}`);
  ok(CAL.DAYS === 77 && CAL.label(CAL.LAST) === 'lun 6 sept', '77 days to Labour Day');
  const G = { prototype2004: true, dayClock: at(19), day: 1, done: new Set(['alternateur', 'sayyad']) };
  ok(/Pas avant le 24 juin/.test(C.dateLock(G, 'arcbache') || ''), 'the Saint-Jean is not offered on the 23rd', C.dateLock(G, 'arcbache'));
  ok(C.dateLock({ ...G, day: 2 }, 'arcbache') === null, 'on the 24th it is');
  ok(/Pas avant le 24 juin/.test(C.dateLock({ ...G, prototype2004: false }, 'arcbache') || ''), 'index.html holds the 24th too (S4-SUMMER: every main mission has a date there)');
  ok(!C.pastSaintJean({ day: 2 }) && C.pastSaintJean({ day: 3 }), 'after the 24th the text stops claiming the date');
  const def = byId('arcbache');
  if (def.datedText) {
    M.resetArcSync(); M.unlockArc({ ...G, day: 2 });
    const on = def.title;
    M.resetArcSync(); M.unlockArc({ ...G, day: 10 });
    ok(def.title === def.datedText.after.title && on === def.datedText.on.title && on !== def.title,
      `on the 24th « ${on} », on 2 July « ${def.title} »`);
  } else ok(false, 'arcbache has dated text');
  M.resetArcSync();
}

group('the night jobs keep their hours (prototype)');
{
  for (const [id, w] of Object.entries(W.MISSION_WINDOWS)) {
    if (!has(id)) continue;
    ok(C.isMain(id), `${id} is a main mission with a window ${w[0]} h-${w[1]} h`);
  }
  ok(JSON.stringify(W.MISSION_WINDOWS.curfew) === '[2,5]', 'the nachos: 2 h to 5 h, before Little Big Man ends');
}

group('the streets counter');
{
  const names = ST.aylmerStreets();
  ok(names.size > 1000, `${names.size} named Aylmer streets`);
  const G = {};
  ok(ST.streetsPct(G) === 0, 'nothing driven, 0 %');
  const first = [...names][0];
  ok(ST.noteStreet(G, first) === true && ST.noteStreet(G, first) === false, 'a street counts once');
  ok(ST.noteStreet(G, 'Not A Real Street In Aylmer') === false, 'a road outside Aylmer does not count');
  for (const n of names) ST.noteStreet(G, n);
  ok(ST.streetsPct(G) === 100, 'every street, 100 %');
  ok(/Rues d’Aylmer que tu connais : 100 %/.test(ST.streetsLine(G)), ST.streetsLine(G));
  const cards = endingCards({ streets: ST.streetsLine(G) });
  ok(cards[cards.length - 1].body.includes('100 %'), 'the last end card carries it');
}

group('the opener still sends him to the Canadian Tire');
{
  ok(Array.isArray(STORY_CARDS) && STORY_CARDS.some((c) => /Canadian Tire/.test(c.body || '')), 'the alternator errand is named');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
