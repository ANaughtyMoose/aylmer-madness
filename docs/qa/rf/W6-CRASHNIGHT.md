# W6-CRASHNIGHT (wave 6 start 20 Oct, finished in wave 7, 27 Oct 2026)

Branch `rf/w6-crashnight`, worktree `wt-rf-w6-crashnight`. Merged `fix/look-on-qr` three times (9b14500, 63d3a47 after the races/medals/replay/English merges, then 8056900 with w6-ramps2 and shortcuts). No rebase, no reset, no push.
All tests ran on the Colab VM through `ct.py` (none on the Mac after the 27 Oct rule).

## Done

1. C-12 core (wave 6, 50ff700): `src/game/replay-ring.js`, smoke `tools/smoke_replay_ring.mjs`.
2. C-04 scoring core (wave 6, 86cdf35): `CRASH`, `WAVE`, `billFor`, `CrashScore`, `scoreable`, `stunCar`, `tryLine`, smoke `tools/smoke_crashnight.mjs`.
3. Crash replay, commit 017d703: `src/game/crashreplay.js` (`CrashReplay`, `crashReplay`, `CRASH_REPLAY`).
   - Named crashreplay.js, not replay.js: the merged `src/game/replay.js` is w7-replay's medal/record module ("une autre run"), unrelated to the crash replay, so nothing there to build on. Nothing duplicated.
   - Records the player plus the 15 nearest traffic cars and rivals (70 m) into ReplayRing at 60 Hz sim time, after `G.time += dt` in tick. When `G.feel.crash` rises (fireSlowmo('crash'), the crash show) it waits 0.8 s of sim time, then copies the ring into a second ring (typed-array `set()`, no allocation) and offers « V : revoir » for 5 s real time.
   - Respects the crash show: while `crashShowQuiet(G)` is true the offer is hidden, does not count down, and `play()` refuses. A teleport during the post-roll freezes early; the offer is cancelled by a new mission, a blocking card, or the car being over 250 m away.
   - Playback: world frozen (no tick, no stepEnv), chase camera behind the recorded car through `G.cineCam` (yaw eased 3/s, floor at ground + 1.1), 1x run-up, 0.35x from 0.3 s before the hit to 0.45 s after, 0.7x after, 0.5 s hold: about 3.5 s. Crash sound once at the hit, a blip on the cut, letterbox + « ● REPRISE » overlay, HUD hidden. Any of V/E/Enter/Space/Esc/Backspace/pad A/B/Start ends it. Player/traffic/rival poses are swapped in only around `render()` and restored bit-exact; `stop()` restores camPos, camYaw, cineCam and focus.
   - Buffers 0.3 MB (two rings). Mean `record()` 2.3 us on the VM (bar 50 us).
4. Crash Night playable, commit 380b456 (+ c4ab2b5 smoke aim):
   - `crashnight.js`: `planJunction` (signal found by both road names; player approach from the west on Principale, 170 m back by walking predecessor edges; 3 queue slots behind your stop bar, 2 oncoming at the far bar; cross approaches = Wilfrid-Lavigne edges arriving within 20 m of the signal), `walkBack`, `setLightsForTry` (cross axis green exactly at GO, yours red GO to GO+15), `chainPass` (wave car-to-car hits billed at 0.5, struck car stunned), `stepNight` state machine (count 3 s with the car held, run up to 14 s, 5 s window after the first scoring hit with a 1 s settle exit after 2 s, try card 2.5 s, three tries), `crashNightMission` def (`mode`, `race`, `keepDamage`, `ownsWreck`, `ownVehicle: false`, night, `result`), `startCrashNight` (refuses over a story job), `crashNightState`, `installCrashNight`, `medalFor`, `DESCRIPTOR`.
   - Wave: the first 8 plain traffic cars become Caravan / Cutlass / 240D (non-cast only); queue and oncoming pinned until touched; cross cars timed to the box and kept on their path; everyone else parked 700 m+ away with respawn frozen. Player softened to `damageSensitivity` 0.5, repaired each try; a try ends at damage 90.
   - Cleanup (finish, fail, abort): traffic hook released, player damage and sensitivity back to pre-night, every traffic car's spec/size/tint/pace/lane restored and respawn/stun cleared. Best of 3 saved through `save.saveRecord('crashnight', best, { better: 'higher' })`.
   - Geometry note: Wilfrid-Lavigne is a one-way pair here; northbound joins Principale at a node 13 m west of the signal node, so cross cars cut across your lane just before your stop bar. Works well as a T-bone target.
5. Wiring (all marked `[w7-crashnight]`):
   - `src/game/traffic.js`: `this.onHit = null` and one call `onHit(car, body, closing)` at the end of `collidePlayer`, after the stun block (stun unchanged).
   - `src/game/modes.js`: `registerMode(desc)` / `extraMode(id)`: an outside mode gets a picker tab with one row (medal targets and your record), click or digit starts `desc.start(G)`.
   - `src/game/hud.js`: prompt source `replay`, ranked above mission.
   - `src/main.js` (about 56 lines): imports; `crashReplay.init` after Reactive; `record` after `G.time += dt`; `crashReplayFrame(dt)` after `input.update` in frame (playback branch / prompt feed) and the `|| crashReplay.playing` guard after `handleKeys()`; V = replay only while offered, else weather; `AYLMER.step` runs no tick/stepEnv under a replay; `quickSave` refuses during playback; `keepDamage` skips both prepareForJob calls; `def.result` finish branch (closeMission, result toast, no day, no G.done, no card); `ownsWreck` skips the tow at DEAD; `installCrashNight(G, { startMission }, modes)` and `window.AYLMER.crashNight` / `window.AYLMER.crashReplay` (`stats`, `offered`, `press`, `stop`).

## Checks (Colab VM)

- `smoke_crashreplay.mjs` 28/28, `smoke_crashnight.mjs` ok, `smoke_crashnight_mode.mjs` 31/31 (plan: start (-378.7, -131.7), 2 oncoming, 2 cross; scripted straight run scores 7 230 $ on each of the 3 tries, the same to the dollar every try; no-contact night 0/0/0 with the wave held within 0.1 m; record saved; cleanup checks), `smoke_traffic`, `smoke_modes`, `smoke_ui`, `smoke_replay`: GREEN (run c4ab2b5).
- Full suite run 1 (2104883): 108/114. VM-only: smoke_audio, smoke_harness_gate, smoke_models. Mine: smoke_save (its no-dialog scan matched `crashReplay.prompt(`: renamed `offerText`), smoke_retry (« Tôle froissée interrompue » had no fail reason: now « abandonnée », a quit), smoke_missionclose (stale smoke on the old merge base, fixed by merging 8056900). The three reran GREEN (b03b819).
- Full suite run 2 on 58cc04a: 112/115, ct RESULT GREEN (the 3 misses are the VM-only smoke_audio, smoke_harness_gate, smoke_models; the lead reruns them on the Mac).

## Cloud checks for the lead (browser)

1. Boot both entries, 0 console errors.
2. Crash replay: drive 70+ km/h into a traffic car; after the side-camera show ends, « V : revoir » shows for 5 s; V plays about 3.5 s from behind the car with the world frozen; car back exactly where it was after. `AYLMER.crashReplay.stats()` gives `lastPlay.startMs` (bar 200 ms) and `clip.dur` about 2.0.
3. Crash Night: M, arrow to « Tôle froissée », 1. Night, car on Principale facing the light, wave in place, three tries, result toast, record shown in the tab after reload. `AYLMER.crashNight.start()` / `.state()` / `.records()` for scripting.
4. Perf8 quiet window at med: recording runs every tick in free roam (2.3 us mean in node).
5. `harness --plan ranger-rerun --only crash`: crash beats unchanged.

## Open for the lead / Tom

- Medals are still the spec's placeholders (bronze 6 000, argent 16 000, or 30 000 $). The node bot straight earns 7 230 $ (bronze). Spec step 9 wants bot S calibrated in the browser: bronze <= 0.8 S, argent about 1.7 S, or about 3.2 S.
- Not done from C-04: limp outside jobs (damage.js `applyLimp`, tow `handleWreck`), `noteImpact`/`drainImpacts`, `breakables.restoreAll()` between tries, the places JSON, the beats. Not done from C-12: debris/particle capture, the low-side and overhead shots, the date stamp (the brief asked for the chase camera only).
- A mid-mode save resumes as « Job perdue » (same as courses).
- Avatars' lawn hello can still fire during a replay next to a cast house (C-12 contract item 5 risk); `vLong` is posed to the recorded speed, which mostly keeps it quiet.
- The key legend still says V = météo (i18n not touched).
