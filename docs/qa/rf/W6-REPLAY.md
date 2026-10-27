# W6-REPLAY: medals, records, ghost (wave 6 started, wave 7 builder continues)

Branch rf/w6-replay, worktree wt-rf-w6-replay. Wave 7 merged fix/look-on-qr 786acf4 first (57f6dc7).

## Status (wave 7, 27 Oct 2026): C-02a core, C-02b records and ghosts, C-11 core done; full suite GREEN on the VM
Tom's Mac crashed under test load mid-run; from then on every test goes through the Colab VM (`ct.py test`), nothing on the Mac but `node --check`.

Done and committed:
1. 33f69da save.js records and ghost store (C-02b): `saveRecord / loadRecord / listRecords` on `aylmer.records` (top 5 per id, `by` and `car` clamped to known ids, legacy fold of `aylmer.modes` read-only, corrupt copy kept, wipe guard), `saveGhost / loadGhost / deleteGhost / ghostStats` (`aylmer.ghost.<id>`, base64 Float32, 256 KiB cap, 1.2 M char budget, 12 max, LRU on a monotonic `used`, faster ghost stays), `writeSlot` evicts ghosts before reporting quota, `wipeKeys` takes records and ghosts. Smoke: tools/smoke_records.mjs (50 checks, incl. a record and a 200 kB ghost surviving a reload, a capped 600 k char browser, wipe and undo). The C-02b optional step 6 (extras) is NOT done.
2. 6a89e1c / 7eaf8d8 medals.js (pure, no imports): course thresholds for the 8 courses (COURSE_PACE, frozen in step 5), blitz bronze capped at budget minus 10 s, D41 names (Or Sayyad, Argent Adam, bronze unnamed) on course notes only, `medalNote / jobMedalNote`, `resultLine` per C-02a's table (time with tenths, margin rounded down, gap rounded up, elision, EN), `failLine` (estimate, « environ »), `distText` with a French comma, chase stages that share a clock judged as one run, record ids (`stage:<job>:<n>-<of>`, course ids as is), thresholds cached per key. tools/smoke_medals.mjs rewritten (112 checks). tools/smoke_modes.mjs: records each pace lap's exact seconds (no new random draws) and a new last group checks the frozen pace within 8 %, order, and the blitz 10 s reserve.
3. 0bc57f4 wiring:
   - src/game/replay.js (new): `stageStart`, `stageDone`, `failLine`, `lastResult`. A story stage is judged on its own clock (m.race.t inside a race stage), a course on m.race.t at its last stage, records through `save.saveRecord`. « Nouveau record » only when an older record was beaten (a first run is not one).
   - main.js, every edit marked [w7-replay]: imports; brief card note gets the medal line(s); `applyStage` opens a run; stage success shows medal or gap (toast mid-job, inside the FINI toast and the JOB TERMINÉE card at the end); `failMission` appends the estimate line to the fail card only when a retry was offered (never on an abandon); R block: a course retry goes through `restartRun` (fixes « Job perdue » on a failed course), then `tickRerun`; a course finish skips the JOB TERMINÉE card so R works at once; `window.AYLMER.medal()` and `.thresholds(id)`.
   - modes.js: `startCourse(G, course, opts)` passes opts, `restartRun / offerRerun / tickRerun` (10 s window, consumes KeyR, closes itself when a mission starts), picker rows get three target pills, a medal disc and « ton record » from the medal record (m.race.t, legacy grid-inclusive times ignored), header « Temps à battre »; the « MEILLEUR TEMPS » toast is skipped when a medal line was shown.
   - tools/smoke_replay.mjs (new): stage and chase judging, records survive a reload, fail lines, course judging on race time, restartRun with `{ card: false }`, the rerun window, picker pills.

4. 96024fb ghost (C-11, core): src/game/ghost.js (new). Records a course run (and the solo story Blitz) at 20 Hz from GO (x, bodyY, z, unwrapped yaw, pitch, roll, steer), teleports kept as cuts, runs over 240 s saved at 10 Hz. On a finish the run goes to an in-memory cache at once (R races it straight away) and to `save.saveGhost` in a `setTimeout(0)`, so the encode lands on the end card; a slower run is refused by the store, a fail or quit is dropped. Playback: Catmull-Rom positions, linear angles, wheel spin from path length; translucent (0.34), unlit, medal tint of the run that set it (or, argent, bronze, pale blue), fades to nothing within 2.5 m of you and is full at 7 m, holds 1.5 s on the line then fades; culled at 400 m; 5 draws for a car, no shadow, no collision, no sound. End card: « Fantôme battu de 1,1 s » / « 0,4 s derrière le fantôme » / « À égalité avec le fantôme ». main.js: `ghost.update(G)` after `updateMission`, `ghost.draw(r, G, carById)` with the rivals, the ghost line in the FINI toast and card, `window.AYLMER.ghost()`. tools/smoke_ghost.mjs (24 checks): record, save, reload, replay within 0.5 m, slower run kept out, faster run replaces, teleport cut without a slide, a fail never saved, 10 Hz long run under the size cap, sampleAt cost.
5. 2c4fc80 COURSE_PACE frozen from the measured laps (VM): bz_vieux 109.7, bz_aylmer 286.2, bz_ouest 209.7, bz_hull 393.8, cp_ruelles 145.1, cp_traverse 263.5, cp_deschenes 330.3, cp_hull 393.1 s. Thresholds: bz_vieux 99 / 110 / 126; bz_hull bronze capped at 440 (budget 450).

## Tests (all on the Colab VM; nothing ran on the Mac but `node --check`)
- 96024fb named: smoke_medals 112 checks, smoke_records 50, smoke_replay 26, smoke_ghost 24, smoke_modes 138 passed 0 failed (including the new frozen-pace group). GREEN.
- 2c4fc80 full suite: 105/108 suites; the 3 failures are the known VM-only ones (smoke_audio, smoke_harness_gate, smoke_models), counted GREEN by ct.py; the lead reruns those 3 on the Mac. Log: references/review/colab-test/logs/2c4fc80-1027-011724.log.
- Earlier: the smoke_medals cost check was 5.8 / 5.5 ms on the VM (bar 5 ms, from C-02a). Fixed by caching thresholds per key and warming both calls before timing; the bar was not raised.
- The commit after 2c4fc80 touches only this report.

## Not done (left for the lead or a later wave)
- C-02a: the mode registry (registerMode and friends), the route preview canvas, arrow/Enter highlight in the picker, C-02a's step 2 race calibration (racedave, racecivic, circuit have no medals), tools/review/beats/C-02a.mjs.
- C-02b: optional step 6 (summer extras).
- C-11: the split chip at each gate (« FANTÔME -0,8 s »), the grid label « Fantôme : Tom, 1:52,3 », the « le fantôme de Tom » wording for another character, the review beat. Gate splits are not recorded yet.

## Open issues for the lead
1. Every course run still spends a day (endOfJob), which works against « une autre run ». Not in this task.
2. Two record tables: G.best and the purse still compare m.elapsed (grid-inclusive); medals and « ton record » use m.race.t. Old `aylmer.modes` bests are grid-inclusive, so the picker ignores them for « ton record » (they still fold into the records table as legacy rows).
3. gl.js copies the model matrix (`new Float32Array`) for every transparent draw, so the ghost's 5 draws allocate 5 small arrays per frame while it is visible. That is gl.js's existing behaviour for any alpha draw (not this task's file); flag for the perf owner if perf8 shows GC.
4. A story stage fail estimate uses the straight line to the current flag (a chase over several flags leans short; « environ » says so).
5. Story stage medals carry no target names (D41 is about the course table); course notes and pills name Sayyad (Or) and Adam (Argent) only.
6. The C-02a spec's JOB TERMINÉE card is now skipped for courses (a 4.6 s toast instead) so R works at once, as the spec recommended.

## Cloud checks for the lead
- Boot both entries, 0 console errors.
- Harness `--only course` (bz_vieux, cp_ruelles): brief card shows « Temps à battre : Or ... (Sayyad) · Argent ... (Adam) · Bronze ... »; finish toast shows the medal line; `AYLMER.medal()` non-null; R within 10 s puts the truck back on the line with no card.
- A timed story stage (dep 2/2): medal toast on clear; a clock-out fail card ends with « Il restait ... ».
- Picker (M): three pills per course row, disc after a medal, reload keeps « ton record ».
- Ghost: finish bz_vieux, press R within 10 s: a bronze-tinted translucent Ranger leaves the line at GO, fades when you overlap it, `AYLMER.ghost()` shows loaded; reload the page and start the course again from M: the ghost is back. perf8 at med with a ghost visible.
