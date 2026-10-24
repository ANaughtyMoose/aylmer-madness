// Smoke: the review harness's verdicts (tools/review/verdict.mjs). Fail causes
// from the game's own toasts, the two columns, and the pack compare table.
// No browser.
import assert from 'node:assert/strict';
import { failCause, tally, needsFreshRun, packRows, compareTable, mergeMetrics } from './review/verdict.mjs';

const f = (outcome, why = '', assists = []) => ({ outcome, why, assists });
assert.equal(failCause(f('done')), 'done');
assert.equal(failCause(f('fail', 'RATÉ\nLe char est fini. Remorqué.')), 'wrecked');
assert.equal(failCause(f('fail', 'RATÉ\nTrop tard, mon chum.')), 'clock');
assert.equal(failCause(f('fail', 'RATÉ\nLe chrono est à zéro. Le blitz est fini.')), 'clock');
assert.equal(failCause(f('fail', 'RATÉ\nRamassé par la police d’Aylmer.')), 'caught');
assert.equal(failCause(f('fail', 'Adam est déjà stationné. Il te fait de la main.')), 'lost-race');
assert.equal(failCause(f('fail', '', [{ kind: 'teleport' }, { kind: 'abandon' }])), 'bot-abandon');
assert.equal(failCause(f('harness-timeout')), 'harness-timeout');
assert.equal(failCause(f('hand-play')), 'hand-play');
assert.equal(failCause(f('fail', 'quelque chose')), 'other');

const t = tally([f('done'), f('done', '', [{ kind: 'teleport' }]), f('fail', 'Trop tard'), f('hand-play'), f('missing')]);
assert.equal(t.played, 3); assert.equal(t.done, 2); assert.equal(t.doneUnassisted, 1); assert.equal(t.fail, 1);
assert.equal(t.failRate, 0.333); assert.equal(t.causes.clock, 1); assert.equal(t.causes['hand-play'], 1);

assert.equal(needsFreshRun(0), false); assert.equal(needsFreshRun(0.4), false); assert.equal(needsFreshRun(46), true);

// An old pack (no fresh column) against a new one (both columns), repeated course kinds keyed apart.
const old = { beats: [
  { beat: 'boot', result: {} },
  { beat: 'mission', id: 'gang', result: { outcome: 'fail', why: 'Le char est fini. Remorqué.', assists: [] } },
  { beat: 'course', result: { kind: 'blitz', outcome: 'fail', why: 'Remorqué', assists: [] } },
  { beat: 'course', result: { kind: 'blitz', outcome: 'done', assists: [] } },
] };
const neu = { headline: { consoleErrors: 0 }, beats: [
  { beat: 'mission', id: 'gang', result: { outcome: 'fail', why: 'Le char est fini. Remorqué.', assists: [], damageStart: 80, fresh: { outcome: 'done', assists: [], damageStart: 0 } } },
  { beat: 'mission', id: 'arcdernier', result: { outcome: 'hand-play', assists: [], fresh: { outcome: 'hand-play', assists: [] } } },
] };
const rows = packRows(old);
assert.deepEqual(rows.map((r) => r.key), ['gang', 'course:blitz', 'course:blitz#2']);
assert.equal(rows[0].fresh, null);
const c = compareTable(old, neu, { nameA: 'A', nameB: 'B' });
assert.equal(c.rows, 4);
assert.match(c.markdown, /\| gang \| RATÉ wrecked \| - \| RATÉ wrecked \| 80 \| done \| better \|/);
assert.match(c.markdown, /\| arcdernier \| - \| - \| hand-play \|/);
assert.equal(c.totals.B.fresh.played, 1); assert.equal(c.totals.B.fresh.done, 1);
assert.equal(c.totals.A.played.fail, 2);
const m = mergeMetrics([old, neu]);
assert.equal(m.beats.length, old.beats.length + neu.beats.length); assert.equal(m.headline.consoleErrors, 0);

console.log('smoke_review: ok (fail causes, two columns, compare table)');
