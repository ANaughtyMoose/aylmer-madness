# s1-harness: make the gate tell the truth

Branch rf/s1-harness from 7ed4dfb. Red team: references/review/redteam-2026-10-19/tech.md sections 2 to 4 (T1, T2, findings 2, 5, 6, 7).

## Step 1: a pack where the game never loaded fails (done)

- harness.mjs: `--audio-dir` and `--opening-dir` go through `path.resolve` before serve.mjs is spawned with cwd at the `--rev` export (the 19 Oct ENOENT).
- serve.mjs stderr is no longer dropped: each line is printed as `[serve.mjs] ...` and appended to the pack's console.log.
- The harness waits up to 15 s for serve.mjs to answer BEFORE Chrome starts. If it exits or never answers: exit 1, `HARNESS ERROR: tools/serve.mjs exited (code 1) ...`, a SERVER-FAILED.txt in the pack with args, cwd and stderr. No beat runs.
- A beat that throws now sets exit code 1 (was only recorded in `result.error`). A failed first boot stops the plan (no 39 beats of TypeErrors against a dead page); `metrics.aborted` says why, SUMMARY.md opens with `Run FAILED (exit 1)` and the beat errors, and the headline `fpsMeanWorst` / `rawFrameMaxMs` are null (Chrome's error page draws 60 fps too).
- Self-test tools/smoke_harness_gate.mjs (in npm test, no browser): a fake serve.mjs served through `--rev <git tree>` (objects only, no ref moves). Proves: dead server exits 1 in under 20 s with its ENOENT shown, a relative `--audio-dir` reaches serve.mjs absolute, SERVER-FAILED.txt written, no beat played; a server that never listens exits 1 "did not answer". `--browser` adds a 404 server in real Chrome: boot beat throws, exit 1, plan stops, SUMMARY says FAILED, headline frame numbers null.

## Step 2: --only never selects nothing silently (done)

- Course beats in every plan carry the course id (`bz_vieux` for index 0, `cp_ruelles` for mode checkpoint): full, full-rest, quick, ranger-rerun, jen, lex, max, sean. playCourse starts the course whose id equals the beat id (falls back to mode/index), so the id is the truth, not a label.
- A course beat without an id gets `course-<mode or index>`.
- `--only` that matches no beat: exit 2 with the list of beat keys; a partial miss prints a warning. New `--list` prints the beats a run would play and exits.
- The 801504d lines (CMP_CHROME, CHROME_GL, --stop-after, the beat loop key line) are untouched.

## Step 3: perf at the Air's real backbuffer (done)

Worked out from the code: gl.js:121 draws CSS size x min(devicePixelRatio, tier dpr cap) x tier scale. Med (options.js:26) is cap 1.5, scale 0.85, so 1.275 on a DPR 2 screen. The M4 Air 13 at its default "looks like" 1470x956 draws 1874x1219 = 2.28 Mpx at med (high: 2940x1912). The old rig (1280x800, DPR 1) drew 1088x680 = 0.74 Mpx, a third of the fill.

- perf.mjs `--display=air` (default): 1470x956 CSS, deviceScaleFactor 2. `--display=legacy` keeps 1280x800 at DPR 1. The display goes into `params` (so a resume cannot mix the two).
- Every row records `backbuffer` (what the canvas really drew, read from the page) and `perMpx` (interval p50 and GPU+CPU p95 per Mpx).
- rig.mjs `Page.open` takes `dpr` (default 1); openRig takes `view` (default legacy, so measure_memory and other rig users are unchanged).
- smoke_perf_tools: new check that the default is air and the arithmetic gives 1874x1219 at med, 1088x680 legacy, 2940x1912 high.

60 s check, NOT a quiet window (load average 9.9 to 24.6 on 10 cores), principale_british noon med, 600 frames, fresh page:

| display | backbuffer | interval p50 / p95 | GPU+CPU p95 | per Mpx (p50, GPU+CPU p95) |
|---|---|---|---|---|
| air (new default) | 1874x1219, 2.28 Mpx | 3.7 / 7.51 ms | 7.98 ms | 1.62, 3.49 ms |
| legacy | 1088x680, 0.74 Mpx | 3.0 / 4.9 ms | 6.30 ms | 4.05, 8.52 ms |

Both rows pass budget. Packs: aylmer-madness/references/review/rf-s1-harness/perf-check-air.json and perf-check-legacy.json. Ports: perf.mjs only accepts CDP 9540-9599 (perf-runtime.mjs reservedPorts, also asserted by smoke_perf_tools), so 9462 was refused; the check ran on server 8262 and CDP 9562. I left that port policy alone.

## Step 4: timing tests under load (done, not loosened)

I chose the quiet-window gate over a calibration loop. A calibration ratio would need a quiet-machine reference value to turn 200 ns / 60 ms / 0.05 ms into ratios, and it can only be measured in the quiet window. Picking it now on a loaded Mac would quietly move the budget. Cache and memory contention also do not scale the same way for a calibration loop and for groundAt's 3.4 MB raster reads, which is why the existing same-process 2.5x ratio still failed at 2.52x under load 67.

- tools/timing-gate.mjs: `timingCheck(ok, print, name, cond, detail)`. With AYLMER_QUIET=1 it is the suite's own ok(), same budget. Without it, npm test still measures and prints `SKIP <name> <numbers> [within budget | OVER budget now; quiet-window check, asserted by npm run test:timing]`, counted neither way.
- Gated: smoke_terrain groundAt 200 ns and the hill 2.5x / 400 ns check, smoke_react P8 streetprops 60 ms CPU bake, smoke_feel per-frame 0.05 ms. smoke_ground 500 ms and smoke_retry 3000 ms are left alone (they have headroom).
- `npm run test:timing` = `run_smoke --timing`: only the suites that import timing-gate.mjs, AYLMER_QUIET=1, and it prints the load average with "NOT a quiet window" when the 1-minute load is over half the cores. npm test ends with a SKIP line naming the three suites, and each suite's row shows "(n timing SKIP)".

## Checks

- npm test: 98/98 (97 + the new smoke_harness_gate), with the SKIP line.
- npm run test:timing: 3/3 under load 8.9 (labelled not quiet). Today: groundAt 80 to 99 ns, hill 1.56x to 1.61x, bake 27 ms CPU, feel 0.00027 ms.
- smoke_harness_gate: 12/12 without a browser.
- boot.mjs, both entries: ok, 0 console errors, W moved 144.6 m each (index 32.5 s, prototype 130 s).
- `git merge-tree` of rf/s1-harness with 801504d: clean, and the merged harness.mjs passes node --check.
- smoke_harness_gate --browser: 16/16. The 404 server in real Chrome: exit 1 after 127 s, the plan stops after the failed boot, SUMMARY.md says `Run FAILED (exit 1)`, headline fpsMeanWorst and rawFrameMaxMs are null.
- `harness --plan quick --only bz_vieux --rev 70fddfb --port 8262 --cdp-port 9462`, run on purpose with the 19 Oct relative `--audio-dir ../aylmer-madness-private/radio` to reproduce the original bug: the server came up (build.audioDir absolute), it played boot plus `course bz_vieux` (beat 11/12), 0 console errors, exit 0, 2.4 min. Before this branch the same command selected nothing (and the relative path killed the server). The course outcome was `fail` on the blitz clock, which is the British Hotel wedge (T3), not the harness. Pack: aylmer-madness/references/review/rf-s1-harness/quick-bz_vieux-70fddfb.

## Open items for the lead

1. Ports: perf.mjs (and camera.mjs) reserve CDP 9540-9599 and refuse 9462, so the perf check used 9562. Either assign builders a 95xx perf port or widen the range. I did not change it.
2. Not done (red team section 3 item 2, beyond this task): raw-timing.js still records on any document. The headline is now nulled when boot fails, but a later beat on a dead page could still record frames.
3. npm test no longer asserts the four timing budgets. Someone has to run `npm run test:timing` in each quiet window (add it to the gate list next to perf8).
4. The perf baselines in docs/qa/perf were taken at 0.74 Mpx. New runs default to the Air backbuffer, so compare old and new reports only with `--display=legacy` or the per-Mpx numbers.
