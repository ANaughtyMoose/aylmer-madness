// Smoke (B-02): the review harness's vehicle truth, gap analyser, script beats
// and the ranger-rerun plan. No browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseTranscript, jobGaps, gapsMarkdown } from './review/gaps.mjs';
import { vehicleTable } from './review/compare.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Gaps: street names, the date line and audio rows are not events.
const tx = [
  '## mission canot',
  '[10s objective] Vente de garage',
  '[20s street] Chemin Fraser',
  '[30s envday] dim 27 juin',
  '[132.8s toastline] Un canot. 45 $.',
  '[140s heckles] SAYYAD / « T’as acheté un canot. »',
  '',
  '### audio mission canot (one row a second)',
  '[60s audio] ranger 40 km/h · engine 2100 rpm 70 Hz load 0.4 · radio off · cues -',
  '',
  '## speedRun',
  '[1s toastline] go',
].join('\n');
const secs = parseTranscript(tx);
assert.deepEqual(secs.map((s) => s.beat), ['mission canot', 'speedRun']);
const g = jobGaps(secs, { over: 60 });
assert.equal(g[0].events, 3);
assert.equal(g[0].worst.secs, 122.8);
assert.equal(g[0].over, 1);
assert.equal(g[1].worst, null);
assert.equal(jobGaps(secs, { all: true })[0].events, 5);   // --all keeps street and date, never audio
assert.match(gapsMarkdown(g), /\| mission canot \| 3 \| 122.8 \|/);

// Vehicle table: an old pack has no vehicle; a new one flags the cart.
const old = { beats: [{ beat: 'mission', id: 'arcsurchauffe', result: { outcome: 'fail', assists: [] } }] };
const neu = { headline: { wrongVehicleBeats: 2, wrongVehicleFresh: 0 }, beats: [
  { beat: 'mission', id: 'golfcart', result: { outcome: 'fail', assists: [], bot: { vehicle: 'ranger>cart' }, vehicle: { want: 'ranger', got: 'ranger', ok: true }, fresh: { sameAsPlayed: true, outcome: 'fail', assists: [] } } },
  { beat: 'mission', id: 'arcsurchauffe', result: { outcome: 'fail', assists: [], bot: { vehicle: 'cart' }, vehicle: { want: 'ranger', got: 'cart', ok: false },
    fresh: { outcome: 'done', assists: [], bot: { vehicle: 'ranger' }, vehicle: { want: 'ranger', got: 'ranger', ok: true } } } },
  { beat: 'speedRun', result: { vehicle: { want: 'ranger', got: 'cart', ok: false } } },
] };
const vt = vehicleTable(old, neu);
assert.match(vt.markdown, /\| golfcart \| - \| - \| ranger>cart \| same \|/);
assert.match(vt.markdown, /\| arcsurchauffe \| - \| - \| cart WRONG \(wanted ranger\) \| ranger \|/);
assert.match(vt.markdown, /\| speedRun \| cart WRONG/);
assert.equal(vt.wrong, 2);
assert.match(vehicleTable(neu, old).markdown, /no vehicle recorded/);

// Script beats: every file in tools/review/beats exports run(page, assert).
const beats = path.join(HERE, 'review', 'beats');
const files = fs.readdirSync(beats).filter((f) => f.endsWith('.mjs'));
assert.ok(files.includes('sample.mjs'));
for (const f of files) assert.equal(typeof (await import(pathToFileURL(path.join(beats, f)).href)).run, 'function', f);

// The ranger-rerun plan: golf night, stvincent onward (arcsurchauffe cut, D31), both races, the driving beats, all asserting the Ranger.
const rr = JSON.parse(fs.readFileSync(path.join(HERE, 'review', 'plans', 'ranger-rerun.json'), 'utf8'));
const ids = rr.beats.map((b) => b.id || b.do);
assert.equal(rr.vehicle, 'ranger');
assert.equal(ids[0], 'boot');
for (const k of ['golfcart', 'stvincent', 'racecivic', 'racedave', 'speedRun', 'crash', 'jumps', 'cops', 'freeRoam']) assert.ok(ids.includes(k), k);
assert.equal(rr.beats.filter((b) => b.do === 'course').length, 2);
assert.ok(ids.indexOf('golfcart') < ids.indexOf('stvincent'));
// D31 (s1-d31): no plan names a job the game no longer has (a cut job fails the
// beat on a missing def). Every mission beat in every plan is a live job.
{
  const { ALL_MISSIONS } = await import('../src/game/missions.js');
  const live = new Set(ALL_MISSIONS.map((d) => d.id));
  const dir = path.join(HERE, 'review', 'plans');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json'))) {
    const plan = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const b of plan.beats || []) if (b.do === 'mission') assert.ok(live.has(b.id), `${f}: mission ${b.id} is a live job`);
  }
}
// Quick ends with the sample script beat.
const q = JSON.parse(fs.readFileSync(path.join(HERE, 'review', 'plans', 'quick.json'), 'utf8'));
assert.ok(q.beats.some((b) => b.do === 'script' && b.id === 'sample'));

console.log('smoke_review_vehicle: ok (gaps, vehicle table, script beats, ranger-rerun plan)');
