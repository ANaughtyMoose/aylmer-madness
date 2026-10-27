// Every way a job ends goes through main.js's closeMission() (architecture
// review F1: quitting to the menu or loading a save during the St. Vincent meal
// left G.mealShift set and the next drive was stuck in the meal overlay).
//
// main.js touches `document` on line one, so no suite can import it. This one
// does the two things node can: it pins the call graph in main.js's text, and
// it runs the real St. Vincent job's stages through the real missionkit cleanup
// to prove that cleanup is what clears the overlay.
//
//   node tools/smoke_missionclose.mjs
import fs from 'node:fs';

let pass = 0, fail = 0;
const ok = (c, msg, extra = '') => {
  if (c) { pass++; console.log('  ok  ' + msg); }
  else { fail++; console.log('  FAIL ' + msg + (extra ? '  — ' + extra : '')); }
};

const MAIN = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
// The body of a top-level `function name(` up to the next line that is only `}`.
const body = (name) => {
  const i = MAIN.indexOf(`function ${name}(`);
  if (i < 0) return '';
  const j = MAIN.indexOf('\n}\n', i);
  return MAIN.slice(i, j < 0 ? undefined : j);
};

console.log('main.js: one close path');
{
  const close = body('closeMission');
  ok(!!close, 'closeMission exists');
  ok(/missionCleanup\(G, m, outcome !== 'done'\)/.test(close), 'it runs missionCleanup (aborted unless done)');
  ok(/refundJob\(G, m\)/.test(close), 'it hands back the pay of an unfinished job');
  ok(/closeMealShift\(\)/.test(close), 'it clears the meal overlay even for a def with no onExit');
  ok(/heckle\.cancel\?\.\(/.test(close), 'it cuts the friends’ lines about the job');
  const assigns = MAIN.match(/G\.mission\s*=\s*null/g) || [];
  ok(assigns.length === 1 && /G\.mission = null/.test(close), 'G.mission = null is written in closeMission and nowhere else', String(assigns.length));

  ok(/closeMission\('fail'\)/.test(body('failMission')), 'failMission closes through it');
  ok(/closeMission\('done'\)/.test(body('updateMission')), 'completion closes through it');
  const upd = body('updateMission');
  ok(upd.indexOf("closeMission('done')") < upd.indexOf('endOfJob(def);'), '...and cleanup still runs before endOfJob()');
  const menu = body('toMenu');
  ok(/closeMission\('quit'\)/.test(menu) && menu.indexOf("closeMission('quit')") < menu.indexOf('pause(false)'),
    'toMenu closes the job before it touches pause or the mode');
  const enter = body('enterDrive');
  ok(/closeMission\('quit'\)/.test(enter) && enter.indexOf("closeMission('quit')") < enter.indexOf('new Vehicle('),
    'enterDrive (load / new game) closes the job before it builds the new car');
  ok(/if \(G\.mission\) closeMission\('quit'\)/.test(body('startMission')), 'startMission over a running job closes it first');
  ok(/closeMission\('restart'\)/.test(MAIN), 'the pause menu’s restart closes through it');
}

console.log('the St. Vincent meal: cleanup is what clears the overlay');
{
  const { LIFE_MISSIONS } = await import('../src/game/lifejobs.js');
  const kit = await import('../src/game/missionkit.js');
  const def = LIFE_MISSIONS.find((d) => d.id === 'stvincent');
  ok(!!def, 'stvincent is a job');
  const stages = def.build({});
  const idx = stages.findIndex((s) => s.kind === 'meal');
  ok(idx > 0, 'it has a meal stage');
  let closed = 0;
  const G = { wallet: null, boat: null, focus: null };
  const m = { def, stages, idx };
  stages[idx].onEnter(G);
  ok(!!G.mealShift, 'entering the meal stage opens the overlay');
  const real = G.mealShift.close;
  G.mealShift.close = () => { closed++; real(); };
  // The path every end now takes: missionCleanup(G, m, aborted = true).
  kit.missionCleanup(G, m, true);
  ok(G.mealShift === null && closed >= 1, 'missionCleanup(aborted) closes and clears G.mealShift');
  // The two paths that used to skip it only nulled G.mission. Show why that
  // was the softlock: without cleanup the overlay is still there.
  stages[idx].onEnter(G);
  const G2 = { ...G };
  ok(!!G2.mealShift, 'skipping cleanup leaves G.mealShift set (the old toMenu/enterDrive path)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
