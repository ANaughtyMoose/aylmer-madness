// The cold open:  node tools/smoke_coldopen.mjs
//
// A new game used to open on a five-card modal that stopped the world. It opens
// in the world now (game/coldopen.js). What this file pins is the part a
// browser cannot tell you and a screenshot cannot either:
//
//   * the lines land in order and end on the alternator, because the first
//     objective has to be the last thing said
//   * the camera is moved by turning a proxy the chase camera already follows,
//     and BOTH G.focus and G.cam come back exactly as they were
//   * control returns at HOLD with nothing pressed, and immediately on a skip
//   * the callback fires exactly once, and end(quiet) does not fire it at all —
//     that is the contract G.story.hide() and tools/headless.mjs depend on
//
// No DOM: the slate is built lazily and skipped entirely without a document.
import { ColdOpen, COLD_OPEN, ORBIT, HOLD, SLATE } from '../src/game/coldopen.js';
import { CAMS } from '../src/game/cockpit.js';
import { FRIEND_LINES } from '../src/game/story.js';

let pass = 0, fail = 0;
const ok = (cond, name, extra) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  — ' + extra : '')); }
};
const group = (n) => console.log('\n' + n);

// A heckle stand-in that records instead of drawing.
const recorder = () => {
  const said = [];
  return { said, line: (who, text, ms) => { said.push({ who, text, ms }); return text; } };
};
const fakeG = () => ({
  cam: 0,
  focus: null,
  veh: { x: 100, z: -50, yaw: 1.2, bodyY: 0.6, spec: { id: 'ranger', len: 4.7 } },
});

// ---------------------------------------------------------------- the words

group('the four lines');
{
  ok(COLD_OPEN.length >= 3 && COLD_OPEN.length <= 6, `${COLD_OPEN.length} lines`);
  let last = -1;
  for (const l of COLD_OPEN) {
    ok(l.at > last, `« ${l.text.slice(0, 26)}… » lands after the one before it`, String(l.at));
    last = l.at;
    ok(l.who === 'Ton père', 'and it is his father talking', l.who);
    ok(l.text.startsWith('«') && l.text.endsWith('»'), 'quoted the way every other bubble is', l.text);
    ok(l.ms >= 2000, 'and it stays up long enough to read', String(l.ms));
  }
  const all = COLD_OPEN.map((l) => l.text).join(' ');
  ok(/clés/.test(all), 'it says how you got the truck');
  ok(/1 200 \$/.test(all) && /f[êe]te du Travail/i.test(all), 'it states the deal — the envelope and the deadline');
  ok(/gaz/.test(all) && /réparations/.test(all), 'and that the running costs are yours');
  // The last line IS the objective. That is the whole point of the reordering:
  // when the camera lets go, the sentence still on screen is the first job.
  const end = COLD_OPEN[COLD_OPEN.length - 1].text;
  ok(/lumière de batterie clignote depuis mardi/.test(end), 'the last line is the alternator errand', end);
  ok(/Canadian Tire/.test(end), '...and it names where to go', end);
  ok(COLD_OPEN.slice(0, -1).every((l) => !/alternateur|Canadian Tire/.test(l.text)),
    'nothing earlier steals it');
  // Same errand, same words as the job's own start line in story.js.
  const father = FRIEND_LINES.alternateur.start[0][1];
  ok(/lumière de batterie clignote depuis mardi/.test(father),
    'and story.js says it the same way at the pillar', father);
  ok(SLATE.length === 2 && /AYLMER/.test(SLATE[0]) && /2004/.test(SLATE[1]),
    `the slate says where and when — « ${SLATE.join(' · ')} »`);
}

// ---------------------------------------------------------------- the camera

group('the camera is moved without touching the camera');
{
  const co = new ColdOpen();
  const G = fakeG();
  G.cam = 1;
  const h = recorder();
  ok(co.play({ G, heckle: h, cams: CAMS }) === true, 'it starts');
  ok(co.active, 'and it is running');
  // What the chase camera in main.js reads is `G.focus || G.veh`, and it eases
  // its yaw toward focus.yaw + PI. So an orbit is a proxy with a turning yaw.
  ok(G.focus && G.focus !== G.veh, 'G.focus is a proxy, not the truck itself');
  ok(Math.abs(G.focus.x - G.veh.x) < 1e-9 && Math.abs(G.focus.z - G.veh.z) < 1e-9,
    'sitting exactly where the truck sits');
  for (const k of ['yaw', 'pitch', 'bodyY', 'vLong', 'vLat', 'spec']) {
    ok(k in G.focus, `the proxy has everything render() reads (${k})`);
  }
  ok(CAMS[G.cam].name === 'far', 'the establishing shot borrows the wide camera', CAMS[G.cam].name);

  const y0 = G.focus.yaw;
  for (let i = 0; i < 60; i++) co.update(1 / 60);
  ok(Math.abs((G.focus.yaw - y0) - ORBIT) < 1e-9,
    `a second of orbit is ${ORBIT} rad`, String(G.focus.yaw - y0));
  // The truck moving under it does not break the shot.
  G.veh.x += 12; G.veh.z -= 4;
  co.update(1 / 60);
  ok(Math.abs(G.focus.x - G.veh.x) < 1e-9, 'the proxy follows the truck if it rolls');

  co.end();
  ok(G.focus === null, 'G.focus goes back to null');
  ok(G.cam === 1, 'and the player gets his own camera back', String(G.cam));
}

group('a page with no car changes nothing');
{
  const co = new ColdOpen();
  const G = { cam: 3, focus: null, veh: null };
  ok(co.play({ G, heckle: recorder(), cams: CAMS }) === false, 'play() refuses');
  ok(!co.active && G.cam === 3 && G.focus === null, 'and nothing was touched');
}

// ---------------------------------------------------------------- the clock

group('control comes back on its own');
{
  const co = new ColdOpen();
  const G = fakeG();
  const h = recorder();
  let done = 0;
  co.play({ G, heckle: h, cams: CAMS, onDone: () => { done++; } });
  for (let i = 0; i < Math.round((HOLD - 0.2) * 60); i++) co.update(1 / 60);
  ok(co.active, `still running at ${HOLD - 0.2} s`);
  ok(h.said.length === COLD_OPEN.length, `all ${COLD_OPEN.length} lines are out by then`, String(h.said.length));
  ok(h.said.every((s, i) => s.text === COLD_OPEN[i].text), 'in the written order');
  for (let i = 0; i < 30; i++) co.update(1 / 60);
  ok(!co.active, `and it lets go at ${HOLD} s`);
  ok(done === 1, 'the callback fired exactly once');
  co.update(1); co.end();
  ok(done === 1, 'and it cannot fire twice');
}

group('Escape drops the rest of the lines and nothing else');
{
  const co = new ColdOpen();
  const G = fakeG();
  const h = recorder();
  let done = 0;
  co.play({ G, heckle: h, cams: CAMS, onDone: () => { done++; } });
  for (let i = 0; i < 2 * 60; i++) co.update(1 / 60);
  const saidSoFar = h.said.length;
  ok(saidSoFar >= 1 && saidSoFar < COLD_OPEN.length, `${saidSoFar} lines out after two seconds`);
  ok(co.skip() === true, 'skip ends it');
  ok(!co.active && G.focus === null && G.cam === 0, 'camera and focus restored on the spot');
  ok(done === 1, 'the waypoint still gets dropped — you skipped the words, not the game');
  co.update(5);
  ok(h.said.length === saidSoFar, 'and no more lines arrive afterwards');
}

group('G.story.hide() — the harness path — is silent');
{
  const co = new ColdOpen();
  const G = fakeG();
  let done = 0;
  co.play({ G, heckle: recorder(), cams: CAMS, onDone: () => { done++; } });
  ok(co.end(true) === true, 'end(quiet) ends it');
  ok(done === 0, 'without firing the callback');
  ok(G.focus === null && G.cam === 0, 'and still puts the camera back');
  ok(co.end(true) === false, 'calling it again is a no-op');
  // The order tools/headless.mjs actually uses: dismiss, then drive.
  const co2 = new ColdOpen();
  ok(co2.end(true) === false, 'and hide() on an open that never played is safe');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
