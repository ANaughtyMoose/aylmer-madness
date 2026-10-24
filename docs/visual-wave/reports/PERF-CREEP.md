# A-11: performance measurement and creep diagnosis

Status: tooling committed on `rf/a11-tooling` and merged with `fix/look-on-qr` (A-10, 7e4548f); npm test 92/92 green. Creep cause found on 12 Oct (section below): Web Audio automation events pile up while the AudioContext is suspended. The fix belongs to the audio owner (src/core/audio.js, src/core/ambience.js), not to A-11. The full quiet-machine 3-tier baseline and the 30-minute post-fix soak are deferred to wave F (F-11).

Repair checkpoint, 11 Oct: all six independent-review findings are repaired within the seven tooling/report paths. Native timing is suspended and drained before external timer-on or timer-off sampling and restored on disposal. GL errors are checked explicitly. Continuous window rollover, representative traffic, comparable empty-sampler heap endpoints, final acceptance recomputation and lock-before-resume output ownership are implemented. A10 readiness is awaited before suppressing draws. Focused offline regressions pass, and lead-run repaired timer-on/off and continuous-window checks pass on Metal. These are tool checks only, not the full baseline or required soak.

## Changes

- `tools/qa/perf.mjs --fresh` opens and boots a separate page for every pose, environment and tier combination. A complete default matrix has 72 rows: eight poses, three environments and three tiers. The non-fresh mode remains a controlled comparison of page reuse.
- Every planned row exists in the initial JSON as pending. The file is atomically checkpointed before and after each row, including errors and interruptions. A failed row does not erase later planned rows. Fresh runs refuse to overwrite a file. The machine lock is acquired before reading or writing resumable output, so a waiter cannot overwrite an active writer. `--resume --out=...` requires the same commit, branch, worktree, tracked diff hash, untracked source hashes and parameters after the lock wait. It preserves previous attempts. Resuming a reused-page run starts a new recorded page session and cannot claim continuous-page evidence.
- Build metadata records dirty state. Untracked symlinks are hashed as links and never followed into private reference trees. Outputs exclude their own exact file from the source fingerprint.
- Perf and memory tools share one per-user machine lock outside the worktrees. A live PID retains its lock regardless of age. A dead runner whose recorded Chrome/server endpoint remains live also prevents takeover. Unknown/malformed ownership is never guessed away.
- Timer queries are deleted when completed, disjoint, reset or disposed. Reset no longer drops pending handles. Created, deleted, pending, peak pending, reset-deleted and disjoint-deleted counters are recorded. A 128-query pending cap prevents a slow GPU from causing unbounded instrumentation allocation; capped, missing or disjoint samples cannot silently pass the GPU baseline.
- The native renderer ring is drained and suspended for both external timer modes. Timer-off therefore issues no elapsed queries during sampling. The suspended ring's allocated handles remain explicit baseline resources and are restored on disposal. Active-target enforcement in the mock catches nested begin and unmatched end; browser followup must also show zero GL errors.
- CPU timing now includes renderer begin through end. The old code started its CPU clock after begin, so historical CPU values are not strictly comparable. Intervals still include time between successive frames. GPU plus CPU uses paired samples.
- Pre-boot GL instrumentation counts explicit create/delete balance for buffers, textures, renderbuffers, framebuffers, programs, shaders, queries, vertex arrays, samplers and transform feedback objects. WeakSets avoid retaining the GL objects. These balances are not driver allocation counts and do not observe implicit garbage collection.
- `tools/measure_memory.mjs` retains the five-point GC memory tour and `--drive N`. It now launches its own server and isolated Metal Chrome profile. An optional URL must identify the owned local port. Attaching to a pre-existing debugger on 9222 is no longer supported. Player storage override flags are refused; the game uses a review namespace within a new disposable profile.
- Performance preparation preserves traffic when clearing cards, then constructs the selected tier's normal Traffic population, including cyclists and buses. Snapshots record expected/actual population and tier; workload mismatches fail. The soak also requires drive mode, stable residency and a vehicle position within one metre of the prepared pose. These checks detect workload changes rather than claiming to freeze normal traffic or simulation.
- `--soak-min=30` runs an uninterrupted wall-clock soak at normal simulation speed with the environment clock held. Sixty-second windows record interval/CPU/GPU distributions, heap, explicit GL balances, world residency, downloaded resources, DOM nodes, browser performance metrics and machine load. Sampling continues while completed windows are collected and checkpointed. Each pending query retains its originating window, and the boundary interval belongs to the next window. Actual sampled seconds, sample counts and window validity determine completion. Both GC endpoints release timing arrays before collecting heap; no forced GC occurs inside measured windows. Counter/driver overhead still needs the timer-off control before any attribution of game growth. Drift compares the median p50 of the first three and last three complete full windows and requires growth <=10 percent. Short or timer-off diagnostics cannot satisfy the acceptance gate. All acceptance flags are recomputed after final errors, cleanup and build consistency checks. A stopped soak requires a new file and full restart.
- Only reserved ports 8240-8299 and CDP 9540-9599 are accepted. Occupied ports are refused before launch. Shared rig machinery owns and closes the new server, browser, profile and pages. The rig's origin clear happens only inside that new isolated profile.

No game code or performance budgets changed. Helpers are `tools/qa/lib/perf-core.mjs`, `perf-instrument.mjs`, and `perf-runtime.mjs`; offline coverage is `tools/smoke_perf_tools.mjs`.

## Contract with A-10

`PLACE` awaits `A.teleport(...)` and `W.sectors.update(...)` before setting noDraw. This works with the current synchronous return and with A-10's readiness promise. The destination's actual GPU prewarm is allowed to draw, then settling is suppressed and sampling begins only after the normal warmup. A-10 must resolve readiness after required residency/uploads/prewarm complete. A fade, scheduled load or queued worker job is not residency evidence.

## Checks completed

- Final repair check: `node tools/smoke_perf_tools.mjs` passed 26/26 in 0.245 s. Coverage includes active-target enforcement, native drain/suspend/restore in both modes, asynchronous native results and an already active native query, continuous boundary timing and late query ownership, GL errors, traffic preservation, acceptance finalization, comparable workload and A10 prewarm ordering.
- `node tools/smoke_storage.mjs`: 135 passed, 0 failed.
- Both tool entry points and all helper files pass syntax checks. Both `--help` paths run without a browser.
- `git diff --check` passed.
- `node tools/qa/owned-files.mjs --task=A-11 --base=fix/look-on-qr` passed: eight changed paths, zero outside ownership. Seven are this task's tools/report; the eighth is the lead-owned A-11 registry entry. No game source changed.

Pending: full `npm test`, both-entry boot, real Metal tool validation, complete baseline and 30-minute soak. No baseline or acceptance soak was launched during parallel preparation. The lead subsequently verified the two short tool runs below. No claim about the historical creep cause is made here.

## Exact run commands after the lead grants the machine QA slot

From the A-11 worktree after updating it to the final A-05/A-10 integration build, create one new dated folder. These commands leave the unfinished 6 Oct files intact.

```sh
RUN_OUT="../aylmer-madness/references/review/baseline-2026-10-06/$(date -u +%Y%m%dT%H%M%SZ)-a11"
mkdir -p "$RUN_OUT"

# Small Metal tool validation first. These do not satisfy baseline/soak gates.
CMP_SRV_PORT=8244 CMP_CDP_PORT=9544 node tools/qa/perf.mjs --poses=chase_fraser --env=noon --tier=med --frames=60 --fresh --out="$RUN_OUT/metal-tool-check.json"
CMP_SRV_PORT=8244 CMP_CDP_PORT=9544 node tools/measure_memory.mjs --soak-min=0.1 --window-seconds=2 --warmup-seconds=1 --out="$RUN_OUT/short-tool-check.json"

# Required complete baseline, exactly 600 measured frames per each of 72 rows.
CMP_SRV_PORT=8244 CMP_CDP_PORT=9544 node tools/qa/perf.mjs --poses=perf8 --env=noon,night,rain --tier=low,med,high --fresh --out="$RUN_OUT/fresh-metal.json"

# Same matrix and query instrumentation with a reused page.
CMP_SRV_PORT=8244 CMP_CDP_PORT=9544 node tools/qa/perf.mjs --poses=perf8 --env=noon,night,rain --tier=low,med,high --out="$RUN_OUT/reused-metal.json"

# Query-free control isolates instrumentation cost; it is not a GPU baseline.
CMP_SRV_PORT=8244 CMP_CDP_PORT=9544 node tools/qa/perf.mjs --poses=perf8 --env=noon,night,rain --tier=low,med,high --timer=off --out="$RUN_OUT/reused-metal-no-queries.json"

# Required continuous soak. Do not run a broad suite or another Chrome beside it.
CMP_SRV_PORT=8244 CMP_CDP_PORT=9544 node tools/measure_memory.mjs --soak-min=30 --window-seconds=60 --warmup-seconds=60 --pose=chase_fraser --env=noon --tier=med --out="$RUN_OUT/soak-metal-30min.json"
```

For an interrupted perf run only, reuse its full original command and append `--resume`; do not change any source file between attempts. For a soak, use a new output file and repeat the full duration. Full-suite and boot gates still apply before committing tooling.

## Evidence needed before naming the creep cause

The old RESET dropping unresolved query handles is a confirmed lifetime defect in the measurement tool. It is not proof that it caused the historical 2.4-to-8.9 ms change. The new offline test reproduces the lost-handle condition and verifies deletion, but cannot measure a GPU slowdown.

Compare fresh/reused row order, heap after equivalent work, explicit GL balances, renderer buffer bytes and query diagnostics. Check machine load and page/session boundaries before attributing a trend. Compare timer-on/off reused runs to estimate instrumentation influence. If renderer memory, residency, traffic or another game subsystem grows, record the measured object/heap series and assign its fix to that subsystem's Wave B/F owner. Do not invent a cause or adjust a threshold. If the 30-minute drift exceeds 10 percent, A-11 stays open until the actual fix lands and an uninterrupted repeat passes.

## Lead Metal tool validation, 11 Oct 2026

The lead ran isolated headless Chrome on ANGLE Metal, Apple M4, after the ports merged. Subsequent independent review invalidated all GPU timing numbers below: native and external elapsed queries collided, and the scene preparation removed ambient traffic. These runs prove startup and cleanup only. They are not baseline, drift or acceptance evidence, and their recorded pass fields must not be reused.

- The fresh 60-frame row exited 0 and the short soak completed, but their timing and resource trends are invalidated by the query conflict and missing traffic. Their original JSON is retained unchanged as historical evidence.
- The short soak's ineligible status was correct for its duration. That does not validate its measurement method or imply that a longer run of that old code would be acceptable.

Private evidence: baseline-2026-10-06/2026-10-11-a11-tools-check-1/metal-tool-check.json and short-tool-check.json. Full suite, both-entry boot, full baseline, diagnosis and continuous 30-minute soak remain pending.

## Lead validation after measurement repairs

The lead independently reran all 26 focused groups and reviewed native timer ownership, continuous sampling, workload checks and final acceptance recomputation. Three isolated ANGLE Metal runs on Apple M4 used the unchanged game at `8fd1d05` and the repaired tools. Source fingerprints remained stable through each run.

- Timer-on: 60 frames, 60 GPU samples, 60 queries created and deleted, zero pending, native ring drained four results, no GL or page errors. Medium used 35 traffic entities from the base count of 26, including the normal cyclists and buses. Interval p50/p95 was 3.4/6.3 ms; paired GPU plus CPU p95 was 6.368 ms. This short row is not a 72-row baseline.
- Timer-off: 60 frames, zero created or pending external queries, native timing suspended, no errors. Interval p50/p95 was 4.3/8.8 ms. Budget pass remains false because GPU evidence is intentionally absent.
- Continuous-window smoke: six windows totaling 14.3244 sampled seconds. The first window had n minus one intervals and each later window had exactly n, including boundary gaps. Every GPU result remained with its originating window and every closed window drained completely. Both GC endpoints had zero retained timing samples; retained heap difference was 455,160 bytes. Traffic stayed at 35, pose/residency/build remained consistent, and no errors occurred. The short diagnostic drift was 5.556 percent, but both acceptanceEligible and acceptancePass correctly remain false. This does not establish long-run stability.

The next required evidence remains the complete 72-row baseline on the A10 integration build, evidence-based diagnosis and a continuous eligible 30-minute soak. Historical invalid runs remain preserved. No budget changed.

## Short Metal run and creep diagnosis, 12 Oct 2026

Build: `rf/a11-tooling` with A-10 merged. Ports 8252/9552, own isolated Chrome profile, ANGLE Metal on Apple M4. The machine was busy with other agents (load average 4 to 18, free memory under 150 MB), so every timing below is indicative only, not baseline evidence. Private evidence: `references/review/baseline-2026-10-06/20261013T055353Z-a11-short/`.

Short perf rows (300 frames, noon, four poses: chase_fraser, principale_strip, galeries_lot, marina_quay):

| run | low p50 by row | med p50 by row | GPU+CPU p95 range | queries | GL balances |
|---|---|---|---|---|---|
| fresh page per row | 2.3, 2.7, 2.5, 2.2 ms | 2.9, 3.0, 2.9, 2.9 ms | 2.1 to 6.6 ms | created = deleted, 0 pending | flat, identical every row |
| reused page | 2.6, 1.8, 1.9, 2.2 ms | 2.8, 3.1, 3.3, 3.6 ms | 2.4 to 4.9 ms | created = deleted, 0 pending | flat, identical every row |

All 16 rows met budgets. Fresh rows are flat; the reused page already drifts up about 0.27 ms per row on med, the same slope as the 6 Oct baseline (2.4 to 9.9 ms over 24 reused rows, independent of pose and environment).

10-minute soak (`measure_memory.mjs --soak-min=10`, chase_fraser, noon, med, 35 traffic entities):

| window (min) | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| interval p50 ms | 5.0 | 7.0 | 8.7 | 17.7 | 20.6 | 24.0 | 39.6 | 40.8 | 70.2 | 184.5 |
| main-thread script ms per frame | 4.8 | 6.9 | 8.6 | 14.3 | 20.5 | 28.6 | 46.6 | 44.0 | 89.6 | 210.5 |
| GPU p50 ms | 3.3 | 3.1 | 2.8 | 2.8 | 1.6 | 2.5 | 2.9 | 1.7 | 2.8 | 6.2 |
| renderer CPU p50 ms | 0.3 | 0.3 | 0.2 | 0.2 | 0.2 | 0.3 | 0.3 | 0.3 | 0.3 | 0.7 |
| Chrome AudioHandlers | 72 | 72 | 72 | 87 | 87 | 107 | 112 | 187 | 237 | 237 |

What does not grow: JS heap (153 to 167 MiB, no trend), every explicit GL create/delete balance (buffers 9954, VAOs 4624, textures 5, programs 2, all constant), renderer GPU bytes, draws and triangles (slightly down), traffic count (35 throughout), world residency, DOM nodes and resource entries. Timer queries stayed balanced (40229 created and deleted, 0 pending at the end). So the creep is not memory, GL handles or entity counts, and not GPU or draw submission: it is main-thread JavaScript outside `renderer.begin..end`, growing per frame.

Cause, from CPU profiles (4 s sampled every 50 s over a 6-minute soak, `creep_profile.json`): `AudioParam.setTargetAtTime` is 562 ms of the first 4 s sample and 3,300 to 3,900 ms of every later 4 s sample, about 90 percent of main-thread time; nothing else grows. In the soak page the AudioContext is `suspended` with `currentTime` stuck at 0 (no user gesture in headless Chrome). The game still calls `setTargetAtTime(value, ctx.currentTime, T)` for about 40 params every frame (engine voice, wind, air, skid, rattle, ambience). Chrome only prunes automation events once the audio clock passes them, so with a frozen clock each param's event list grows without bound and every new call costs more. One-shot sounds (traffic honks, blips) that are scheduled to stop at `t + dur` also never end while the clock is frozen, which is the AudioHandlers growth.

Confirmation: the same 7-minute soak with a page-side diagnostic patch that skips AudioParam automation while `ctx.state !== 'running'` held 3.0 to 5.4 ms per frame from start to end (`fixcheck.log`), against 5 to 24 ms over the same span unpatched. The patch was a scratch diagnostic only; no game or tool file carries it.

This also explains the 6 Oct row-order creep: that run reused one headless page whose context never ran. Real players are exposed whenever the loop runs with a suspended or interrupted context: before the first gesture, after Safari or iOS interrupts audio, or when a browser suspends audio in a background tab.

### Fix proposal (owner: audio, not A-11)

In `src/core/audio.js`, skip every per-frame automation call while the context is not running, using the existing `running` getter (line 87):

- `engine()` line 263: change the guard to `if (!this.ok || !this.driver || !this.running) return;` (covers the engine voice `set()` at lines 834 to 920, the rattle at 630 to 631 and the road voice at 268).
- `environment()` line 204: add `|| !this.running` so `Ambience.update()` (`src/core/ambience.js` lines 25 to 35) is not called.
- `skid()` line 273, `wind()` line 411 (automation at 439 to 442) and the air voice at 401 to 402: same early return.
- One-shots `blip()` 280, `chime()` 292, `honk()` 325, `misfire()` 446, `wrench()` 539: return early when `!this.running`, so stopped-in-the-future nodes do not pile up while the clock is frozen.
- Optional hardening: on the `running` transition in `_stateChanged()` (line 89), call `cancelScheduledValues(ctx.currentTime)` on the long-lived params before the next frame sets them, so any events queued before the guard are dropped.

Values converge within one smoothing constant once the context resumes, because the next frame sets every param again. Acceptance for the fix: the 30-minute soak (F-11) holds p50 drift at or under 10 percent, and AudioHandlers stays flat.

### Tool note

Two runs in Node 26 hit an uncaught `setTypeOfService EINVAL` thrown from undici inside a socket event during teardown or a CDP `fetch` (the 10-minute soak recorded all ten windows first, then ended `interrupted`; one diagnostic run died at start). It is a Node 26 runtime fault, not a measurement defect, but it can cost a long soak its final GC endpoint. Follow-up for F-11: run the soak on Node 22 LTS, or wrap the CDP `fetch` calls with a `process.on('uncaughtException')` filter for this exact code in `perf-runtime.mjs`.

### Deferred to wave F (F-11)

- The complete quiet-machine 72-row fresh baseline (perf8, noon/night/rain, low/med/high), plus reused-page and timer-off controls, using the commands above.
- The continuous 30-minute soak after the audio fix lands, with acceptance from the tool (drift at or under 10 percent).
