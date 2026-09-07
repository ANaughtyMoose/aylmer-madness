// The first two minutes:  node tools/smoke_firstjob.mjs
//
// Thomas, after the first playtest: « First mission for Tom should not be
// poutine — should be buying something at Canadian Tire », and « reality is I
// never went to the poutine place so it just doesn't feel right ».
//
// So the summer opens on « L'alternateur » — the errand that came with the keys
// — and « Poutine express » drops to fifth and reads as Sayyad's order rather
// than Tom's craving. Four things have to stay true for that to keep working,
// and none of them is visible from any other suite:
//
//   1. the job exists, is a real two-stage delivery, and pays
//   2. it is the job a fresh save is actually offered in the driveway — which
//      is not the same statement as « it is first in OPENING_ORDER », because
//      nearestJob() sorts by distance and only breaks ties in MISSIONS order
//   3. it has no clock, because it is the first thing anybody drives
//   4. somebody speaks at both ends of it, and « Poutine express » is still in
//      the game, still Sayyad's, and no longer first
import fs from 'node:fs';
import { MISSIONS, ALL_MISSIONS, missionById, missionPayout } from '../src/game/missions.js';
import { PLACES } from '../src/game/places.js';
import { REPAIR_SPOTS } from '../src/game/damage.js';
import { friendLines } from '../src/game/story.js';

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  — ' + extra : '')); }
};
const group = (n) => console.log('\n' + n);

const ctx = { carId: 'ranger', carName: 'Ranger', seats: 2, places: 3, money: 0 };

// ---------------------------------------------------------------- 1. the job

group('« L’alternateur » is a real job');
{
  const d = missionById('alternateur');
  ok(!!d, 'it is registered in MISSIONS');
  ok(ALL_MISSIONS.includes(d), 'and in ALL_MISSIONS');
  ok(d.giver === 'home' && PLACES.home.label === '299 Chemin Fraser',
    `offered from ${PLACES[d.giver].label}`);
  ok(d.timeOfDay === 'morning', 'a morning job — your father has just left for work');

  const st = d.build(ctx);
  ok(st.length === 2, `two stages (${st.length})`);
  ok(st[0].at === 'ctire', 'stage 1 goes to the Canadian Tire', String(st[0].at));
  ok(st[0].hold === true, '...and you stop and press E at the counter');
  ok(!st[0].cost, 'the part costs the player nothing — his father prepaid it',
    String(st[0].cost));
  ok(st[1].at === 'home', 'stage 2 brings it back to 299 Chemin Fraser', String(st[1].at));

  const pay = missionPayout(d, ctx);
  ok(pay >= 20 && pay <= 25, `it pays $${pay} — the change out of the hundred`);
  ok(st.every((s) => s.time == null), 'and neither stage has a clock');

  // Every stage says WHAT, HOW and a third way for a player who has stopped
  // moving — the same rule smoke_story holds the rest of the game to.
  for (const s of st) {
    ok(!!s.text && !!s.sub && !!s.hint, `« ${s.text} » has text, sub and hint`);
    ok(/\b(E|W|S|A\/D|GPS|Tab|Espace)\b/.test(s.sub), `...and its sub names a key: « ${s.sub.slice(0, 40)}… »`);
  }
}

group('it introduces the Canadian Tire, which is the paid garage');
{
  ok(REPAIR_SPOTS.some((s) => s.place === 'ctire' && !s.free),
    'damage.js charges you there, so the first job has shown you where money goes');
  ok(/Canadian Tire/.test(PLACES.ctire.label) && /Aylmer/.test(PLACES.ctire.label),
    `and it is on the ${PLACES.ctire.label}`);
}

// ------------------------------------------------------------- 2. it is first

group('a fresh save is offered it, and it, alone');
{
  const first = MISSIONS.find((m) => m.giver === 'home');
  ok(first && first.id === 'alternateur',
    `the highest « home » job in the offer order is « ${first && first.title} »`);

  // nearestJob()'s real tie-break, reproduced: every `home` job is nought metres
  // from the driveway, and it keeps the first one it saw.
  const p = PLACES.home;
  let best = null, bd = Infinity;
  for (const def of MISSIONS) {
    const q = PLACES[def.giver];
    const dist = Math.hypot(q.x - p.x, q.z - p.z);
    if (dist < bd) { bd = dist; best = def; }
  }
  ok(best.id === 'alternateur',
    `standing in the driveway on a new game, the offer is « ${best.title} »`);
}

// -------------------------------------------------------- 3. the poutine run

group('« Poutine express » is still here, still Sayyad’s, and no longer first');
{
  const d = missionById('poutine');
  ok(!!d, 'the job still exists — the Civic and two start points hang off it');
  ok(MISSIONS.indexOf(d) > MISSIONS.indexOf(missionById('alternateur')),
    'it comes after the alternator run');
  ok(MISSIONS.indexOf(d) > MISSIONS.indexOf(missionById('gang'))
    && MISSIONS.indexOf(d) > MISSIONS.indexOf(missionById('sayyad')),
    '...and after « Ramasser la gang » and « Réveiller Sayyad », as Thomas asked');
  ok(/Sayyad/.test(d.brief), `the brief says whose errand it is: « ${d.brief.slice(0, 60)}… »`);
  const st = d.build(ctx);
  ok(/Sayyad/.test(st[0].text), `and so does the first objective: « ${st[0].text} »`);
}

// ------------------------------------------------------------ 4. the talking

group('somebody speaks at both ends');
{
  const s = friendLines('alternateur', 'start'), e = friendLines('alternateur', 'end');
  ok(s.length >= 1 && e.length >= 1, `${s.length} lines at the start, ${e.length} at the end`);
  const who = new Set([...s, ...e].map(([w]) => w));
  ok(who.has('Ton père'), 'his father gives it out: ' + [...who].join(', '));
  // Canon: the father is « Ton père » and nobody in this game has a surname
  // somebody made up.
  const text = JSON.stringify([...s, ...e]);
  for (const bad of [/Ton père\s+[A-ZÉÈ]/, /\bpapa\b/i]) {
    ok(!bad.test(text), `no ${bad} anywhere a player can see it`);
  }
}

group('the opener points at it');
{
  const src = fs.readFileSync(new URL('../src/game/story.js', import.meta.url), 'utf8');
  const card = src.slice(src.indexOf("title: 'PREMIÈRE JOB'"), src.indexOf("title: 'PREMIÈRE JOB'") + 700);
  ok(/alternateur/.test(card) && /Canadian Tire/.test(card),
    'the last story card names the errand and where it is');
  ok(!/poutine/i.test(card), '...and does not still send you for poutine');
}

group('main.js opens the chemin d’Aylmer on it');
{
  const src = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const at = src.indexOf('const START_UNLOCKS = {');
  const table = src.slice(at, src.indexOf('};', at));
  const mall = /mall:\s*\[([^\]]*)\]/.exec(table);
  ok(mall && /'alternateur'/.test(mall[1]),
    `« Galeries d’Aylmer » is unlocked by the alternator run (${mall && mall[1].trim()})`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
