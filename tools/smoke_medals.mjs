#!/usr/bin/env node
// [w6-replay] [w7-replay] Medal thresholds and lines (src/game/medals.js), and
// that every story-stage pace in tools/timers_pace.json has a medal table.
// Pure math: no world, no map.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  STAGE_PACE, COURSE_PACE, TARGET_NAMES, thresholdsFor, medalFor, resultLine, gapText, stageKey,
  medalNote, jobMedalNote, failLine, distText, runText, recordId, stageRunEnd, stageMedalKey, eyebrow,
} from '../src/game/medals.js';
const here = dirname(fileURLToPath(import.meta.url));
const pace = JSON.parse(readFileSync(join(here, 'timers_pace.json'), 'utf8'));
let bad = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) { bad++; console.log('FAIL: ' + msg); } };

// ---- every story clock and every course has three ordered thresholds
for (const [k, v] of Object.entries(pace)) {
  ok(Math.abs((STAGE_PACE[k] ?? -99) - v.pace) < 0.1, 'pace table out of date for ' + k + ' (regenerate from timers_pace.json)');
  const t = thresholdsFor(k);
  ok(t && t.or < t.argent && t.argent < t.bronze, 'thresholds not ordered for ' + k);
}
for (const k of Object.keys(COURSE_PACE)) {
  const t = thresholdsFor(k);
  ok(t && Number.isInteger(t.or) && t.or < t.argent && t.argent < t.bronze, 'course thresholds ' + k);
}
ok(thresholdsFor('blitz 2/2').bronze <= 205 - 10, 'story blitz bronze leaves 10 s');
ok(stageKey('dep', 1, 2) === 'dep 2/2', 'stageKey');

// ---- judging: 20 synthetic finishes (dep 2/2: pace 43.1 -> 39 / 43 / 50).
// [w6-curfew] re-paced 27 Oct (was 42 -> 38 / 42 / 48): every case moved with
// its threshold, same margins and gaps, same strings but the 7,0 tie gap.
const t = thresholdsFor('dep 2/2');
ok(t.or === 39 && t.argent === 43 && t.bronze === 50, 'dep 2/2 thresholds ' + JSON.stringify(t));
const L = (v, extra = {}, en = false) => resultLine({ ...medalFor('dep 2/2', v), ...extra }, en);
const cases = [
  [39, 'Or.'],                                       // a tie on gold: no margin clause
  [37.2, 'Or, avec 1,8 s d’avance.'],
  [38.95, 'Or.'],                                    // 0,05 margin rounds DOWN to 0,0
  [39.4, 'Argent. 0,4 s de l’or.'],
  [39.01, 'Argent. 0,1 s de l’or.'],                 // a 0.01 miss is never 0,0
  [39.1, 'Argent. 0,1 s de l’or.'],
  [39.11, 'Argent. 0,2 s de l’or.'],
  [43, 'Argent. 4,0 s de l’or.'],                    // a tie on silver keeps silver
  [43.05, 'Bronze. 0,1 s de l’argent.'],
  [47.3, 'Bronze. 4,3 s de l’argent.'],
  [50, 'Bronze. 7,0 s de l’argent.'],
  [50.01, '0,1 s du bronze.'],
  [54.3, '4,3 s du bronze.'],
  [114.2, '1:04,2 du bronze.'],                      // gap from a minute: m:ss,d
];
for (const [v, want] of cases) {
  const got = L(v);
  ok(got === runText(v) + '. ' + want, `${v}: « ${got} » wanted « ${want} »`);
}
ok(L(39.4, {}, true) === '0:39.4. Silver. 0.4 s off gold.', 'en silver: ' + L(39.4, {}, true));
ok(L(37.2, {}, true) === '0:37.2. Gold, 1.8 s to spare.', 'en gold: ' + L(37.2, {}, true));
ok(L(54.3, {}, true) === '0:54.3. 4.3 s off bronze.', 'en none');
ok(L(47.3, { newBest: true, rerun: true }) === '0:47,3. Bronze. 4,3 s de l’argent. Nouveau record. R : une autre run', 'record + rerun');
ok(L(47.3, { newBest: true }, true).endsWith('New record.'), 'en record');
ok(eyebrow(medalFor('dep 2/2', 52)) === 'PAS DE MÉDAILLE' && eyebrow(medalFor('dep 2/2', 37)) === 'OR', 'eyebrows');
ok(gapText(64.2) === '1:04,2' && gapText(0.4, true) === '0.4 s', 'gapText');
ok(runText(109) === '1:49,0', 'runText ' + runText(109));
ok(medalFor('nosuch 1/1', 10) === null, 'unknown key gives null');
// No French line with a decimal point.
for (const [v] of cases) ok(!/\d\.\d/.test(L(v)), 'no decimal point in French: ' + L(v));

// ---- the fail line is an estimate and says so
ok(distText(340) === '340 m' && distText(1234) === '1,2 km' && distText(1234, true) === '1.2 km', 'distText');
const f1 = failLine('dep 2/2', 42, 340, 20);      // 42 + 17 = 59 -> 9 s past bronze 50
ok(f1 === 'Il restait 340 m, environ 9 s du bronze.', 'clock-out line: ' + f1);
ok(failLine('dep 2/2', 30, 200, 20) === 'Il restait 200 m.', 'estimate under bronze: distance only');
ok(failLine('dep 2/2', 42, 340, 20, true) === '340 m to go, about 9 s off bronze.', 'en fail');
ok(failLine('dep 2/2', 42, 340, 0).includes('environ'), 'slow average floored at 5 m/s');

// ---- targets: only Sayyad and Adam, first names, never on bronze, courses only
const note = medalNote('bz_vieux');
ok(/^Temps à battre : Or \d:\d\d \(Sayyad\) · Argent \d:\d\d \(Adam\) · Bronze \d:\d\d$/.test(note), 'course note: ' + note);
ok(medalNote('bz_vieux', true).startsWith('Times to beat: Gold'), 'en note');
ok(!/Sayyad|Adam/.test(medalNote('dep 2/2')), 'no names on a story stage');
ok(TARGET_NAMES.or === 'Sayyad' && TARGET_NAMES.argent === 'Adam' && !TARGET_NAMES.bronze, 'target names');
const other = /\b(Zahra|Margaret|Mike|Russell|Norm|Abraham|Tyler|Rob|Tom)\b/;
for (const k of [...Object.keys(COURSE_PACE), ...Object.keys(STAGE_PACE)]) {
  const s = medalNote(k);
  ok(s && !other.test(s) && !/\b(Sayyad|Adam)\s+[A-ZÀ-Ý][a-zà-ÿ]/.test(s), 'note clean for ' + k);
}

// ---- story stage runs and records ids
const chase = [{}, {}, {}, {}, {}, {}, { kind: 'chase1', time: 120 }, { kind: 'chase2', time: 120 },
  { kind: 'chase3', time: 120 }, { kind: 'chase4', time: 120 }, { kind: 'chase5', time: 120 }, {}];
ok(stageRunEnd(chase, 6) === 10, 'a shared chase clock is one run');
ok(stageMedalKey({ id: 'golfcart' }, chase, 6) === 'golfcart 7/12' && stageMedalKey({ id: 'golfcart' }, chase, 7) === null, 'stage medal key');
ok(stageMedalKey({ id: 'bz_vieux' }, [{}, {}], 1) === null, 'a course is not judged per stage');
ok(recordId('dep 2/2') === 'stage:dep:2-2' && recordId('bz_vieux') === 'bz_vieux', 'records ids');
const two = jobMedalNote({ id: 'highwayhull' }, [{ time: 1 }, { time: 1 }, { time: 1 }]);
ok(two.split('\n').length === 3 && two.startsWith('Étape 1 :'), 'a job with three clocks: ' + two);
ok(jobMedalNote({ id: 'dep' }, [{}, { time: 60 }]).startsWith('Temps à battre : Or 0:39'), 'one clock');
ok(jobMedalNote({ id: 'divan' }, [{}, {}]) === '', 'no clock, no note');

// ---- cost: judging is cheap
for (let i = 0; i < 500; i++) { medalFor('bz_vieux', i); failLine('bz_vieux', 50, 300 + i, 10); }   // warm up the JIT
const t0 = performance.now();
for (let i = 0; i < 1000; i++) { medalFor('bz_vieux', 100 + i * 0.01); failLine('bz_vieux', 50, 300, 10); }
const ms = performance.now() - t0;
ok(ms < 5, `2000 judgements in ${ms.toFixed(2)} ms`);

if (bad) { console.log(`${bad} of ${n} medal checks failed`); process.exit(1); }
console.log(`OK: medals, ${n} checks, ${Object.keys(pace).length} story stages and ${Object.keys(COURSE_PACE).length} courses have Or/Argent/Bronze`);
