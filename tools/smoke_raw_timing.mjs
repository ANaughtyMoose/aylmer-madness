// Tiny deterministic clock: no browser, world bake or frame-time assumptions.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

let time = 0, callbacks = [];
const window = {};
const context = vm.createContext({ window, performance: { now: () => time },
  requestAnimationFrame: (fn) => { callbacks.push(fn); } });
const source = fs.readFileSync(new URL('./review/raw-timing.js', import.meta.url), 'utf8');
vm.runInContext(source, context);
const R = window.__rawTiming;
function tick(dt) { time += dt; const next = callbacks; callbacks = []; for (const fn of next) fn(time); }
tick(16);
time += 4;
const id = R.begin('seed-before-teleport');
R.mark('seed');
tick(6000);
let s = R.snapshot(id);
assert.equal(s.n, 1); assert.equal(s.maxMs, 6004); assert.equal(s.over5000Count, 1);
assert.equal(s.crossingBeginCount, 1); assert.equal(s.discardedPositiveGaps, 0);
assert.equal(s.marks[0].label, 'seed');
for (let i = 0; i < 22000; i++) tick(16);
s = R.snapshot(id);
assert.equal(s.n, 22001); assert.equal(s.maxMs, 6004); assert.equal(s.over250Count, 1);
assert.equal(s.worst.length, 64); assert.equal(s.worst[0].dtMs, 6004);
assert.equal(s.over33Fraction, 1 / 22001); // Never round a real stall to zero.
const other = R.begin('fresh-column');
const done = R.end(id);
tick(300);
s = await done;
assert.equal(s.n, 22002); assert.equal(s.over250Count, 2);
assert.equal(R.snapshot(id), null); assert.equal(R.snapshot(other).maxMs, 300);
assert.equal(R.snapshot(R.documentId).n, 22003);
vm.runInContext(source, context);
assert.equal(window.__rawTiming, R); assert.equal(callbacks.length, 1);
for (let i = 0; i < 300; i++) R.mark(`stage-${i}`);
assert.equal(R.snapshot(other).marks.length, 256); assert.equal(R.snapshot(other).droppedMarks, 44);
time += 7000; // Synchronous final cleanup blocks before end is requested.
const trailing = R.end(other);
tick(16); // Sampler was registered first and must run before end resolves.
assert.equal((await trailing).maxMs, 7016);
console.log('smoke_raw_timing: ok (setup gap, >=5s gaps, 22000-frame retention, exact counts, bounded details, final frame, independent columns)');
