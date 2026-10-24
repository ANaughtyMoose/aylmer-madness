# Audio and radio review, 29 September 2026

Reviewer: audio specialist (Claude). Branch `claude/quality-review-2026-09-29`. This was a read-only pass: no source files were edited.

Scope: `src/core/audio.js`, `src/core/ambience.js`, `src/core/input.js`, `src/game/recorded-radio.js`, `radio-library.js`, `radio-storage.js`, `src/prototype/local-radio.js`, `src/prototype/boot.js`, the audio lifecycle in `src/main.js`, and where `economy.js`, `upgrades.js`, `weather.js` and `skills.js` touch the engine driver. The synthetic `src/game/radio.js` (used by `index.html`) was checked only for R/Shift+R semantics.

## Bottom line

The contract Thomas asked for works. R, Shift+R, key repeat, Shift-alone rear view, text/range focus, the five presets, loops, per-station resume, pause, seek, natural end, missing files, rapid tuning and one active source were all confirmed in code and in a real browser. The fix for the silent driveway holds. All four browser harnesses passed (69/69 checks) and all four Node suites passed.

There are no High findings. There are two Medium issues:

1. **Every station change or track loop leaves one media element and one source node in memory.** It is not a large leak, but it never stops growing.
2. **If the browser suspends the AudioContext, nothing brings it back.** The radio then reports that it is playing while the output is silent.

The rest are Low or Info.

## Harness and test results (raw)

Environment: my own headless Chrome 154 (`--headless=new`, port 9224, profile `/private/tmp/claude-501/audio-agent-profile`, autoplay allowed, Metal GPU) and my own `node tools/serve.mjs 8143 --audio-dir …`. The server binds 127.0.0.1 only and enforces a Host allowlist (`tools/serve.mjs:17,55`). It found all 15 private files. Both processes were stopped afterwards.

| Suite | Result | Key numbers |
|---|---|---|
| `tools/smoke_audio.mjs` | 112 passed, 0 failed | e.g. Sunfire 70.4 Hz at 50 km/h, peak 0.143 |
| `tools/smoke_recorded_radio.mjs` | passed | runs with `fadeMs:0`, so the fade/timer path is not exercised |
| `tools/smoke_radio_resume.mjs` | passed | synthetic radio only |
| `tools/smoke_vehicle_spec_layers.mjs` | passed | checks field inheritance only (see F5) |
| `integration-vehicle-audio.html` | **12/12 pass** | idle engine RMS 0.01049 (peak 0.0415); reverse RMS 0.03241 at 5.90 km/h, 1640 rpm; road RMS 0.000312; pause peak 0; resume RMS 0.02519; wet forward RMS 0.0639; swap RMS 0.00713; back to Ranger RMS 0.00991, 800 rpm, voice gain 0.1696 |
| `integration-recorded-radio.html` | **33/33 pass** | CHEZ output RMS 0.0206, peak 0.0807; five presets; all five resume within 0.05 s of the saved 35 s; CBC cycle -2, -3, -1; pause and radio=0 peak 0; 30 rapid tunes settle on the selected station; the 10 s Live 88.5 bumper plays through naturally; mixed CHEZ peak 0.230 and CBC 0.309 (measured after the master compressor); 40 switches created 68 elements with at most one active and 67 retired |
| `integration-audio-game.html` | **16/16 pass** | reload restored Oldies from 72.137 s to 72.224 s; game clock +10 h moved the radio 0.60 s in 0.6 s; frames at home/Principale in rain/marina at night: median 16.7 ms, p95 16.7 ms, max 16.8/16.8/83.3 ms, 0 over 250 ms; heap about 1.01 GB |
| `integration-radio-library.html?audioReview=1` | **8/8 pass** | Majic import of 1,333,797 bytes kept; optional station stays disabled until enabled; unknown file goes to the personal cassette; manual reassignment works |

Harness fragility: on the first attempt Chrome ran with `--use-angle=swiftshader` and managed only 4 frames in 3 s. `integration-vehicle-audio` then **failed its first check** ("Idle produces engine-only signal", RMS 0, peak 0) while the voice gain was 0.17 a moment later. The check samples 200 ms after entering drive, before the game has stepped. On the Metal GPU the same check passed. See F5.

### Extra probes I ran (own CDP scripts, review profile only)

| Probe | Observed |
|---|---|
| Channel independence while driving with the radio on (metered engBus, road out, fx, radioBus, final) | engine=0: engine RMS 0.000002, radio 0.040, fx 0.0002 still present. effects=0: fx 0, engine 0.0289, radio 0.0244. radio=0 and radio off: radio 0, engine 0.029. All independent. Road is pre-fader of the effects bus (F11). |
| Hold R with 10 `repeat:true` keydowns | one toggle only (off to on) |
| Hold Shift+R with 10 repeats | one station step (CHEZ to CBC), power kept, rear view false |
| Hold mode: Shift held, then R | rear view true while Shift alone, false after the chord, false after release |
| Focused `<input type=range>`: R and Shift+R | no change |
| Focused `<button>`: R | **power toggled** (F10) |
| 25 real Shift+R chords at 30 to 110 ms intervals, polled every 5 ms | 9 elements created, at most 1 playing at any poll, settled on the selected station |
| Missing (404) and corrupt (HTML) file on the personal cassette | both marked failed within 155 ms; selection jumped to `chez106`, which played; notice shows only the last failure |
| Simulated autoplay rejection (`play()` throws `NotAllowedError`) | `wantOn` true, `on` false, error "Clique Allumer…", **HUD still visible with the station**; first R turned power **off**, second R played (F3) |
| Window blur | game paused, radio suspended, master gain 0 |
| `document.hidden` true, then false | session stopped; still paused after returning; plays only after unpause |
| `ctx.suspend()`, then pause/unpause | ctx `suspended`, `radio.on` true, element playing, **silent** (F2) |
| 100 station switches in a standalone radio, 3 forced GCs, 10 s wait | HTMLAudioElement 1 to **101**, MediaElementAudioSourceNode 1 to **101** (only one still has `src`); still 101 after `ctx.close()` (F1). Game profile: 27 to 87 after 60 switches. GainNodes did not grow. |
| Swap to an alternate car with engine upgrade 2 | engine driver rebuilt **2 times** in consecutive frames; stock swap back rebuilt once (F4) |
| `setEngineProfile({...a.ep})` | rebuilds; only the same object is preserved (F4) |

## Findings

### F1: Media element and source node retained per restart (Medium)

- **Observed:** Each `restart()` creates a new `HTMLAudioElement` and `createMediaElementSource` (`src/game/recorded-radio.js:193-196`). `retire()` (`:160-165`) pauses the element, removes its `src` and disconnects it. Chrome still keeps both the element and the source node alive for the life of the AudioContext: 100 switches left 101 of each after forced GC. Natural track ends (`onended` to `next()` to `restart()`) and every `toMenu()` (F8) also add one.
- **Expected:** The plan (§5 and phase C) calls for "clean up nodes" and "memory does not continually grow". The report only claims source URLs were released, which is true. The retained objects no longer have media buffers, so each one is small. The growth is unbounded, though, and I did not measure the bytes per element.
- **Repro:** Standalone `RecordedRadio`, run `nextStation()` 100 times, then count with CDP `HeapProfiler.collectGarbage` + `Runtime.queryObjects(HTMLAudioElement.prototype)`.
- **Confidence:** High for the retention. Medium for its practical impact.
- **Fix:** Create one `HTMLAudioElement` and one `MediaElementAudioSourceNode` in `build()` and keep them. Keep a persistent per-session gain for the fade, or an A/B pair of elements if an overlapping crossfade is ever wanted. On switch: fade out, set the new `src`, `load()`, seek on `loadedmetadata`, fade in. The request tokens already guard against stale callbacks. This also makes "exactly one source" structural rather than just observed.
- **Validation:** Repeat the 100-switch probe and expect a constant element count (1 or 2). Re-run `integration-recorded-radio` (the "exactly one active" and "release media URLs" checks will need their counting adjusted to one element).

### F2: AudioContext suspension is never observed or recovered (Medium)

- **Observed:** `Audio.resume()` only acts when `state === 'suspended'` (`src/core/audio.js:169`), so Safari's `interrupted` state is ignored. It is only called on the first pointerdown (`main.js:2952`, `{once:true}`), at game start (`main.js:1074`) and in `RecordedRadio.power(true)`. `pause(false)` (`main.js:2864-2869`) and visibility return never call it. Nothing listens to `ctx.onstatechange`. After `ctx.suspend()` plus a pause/unpause cycle, the radio reported `on: true` with its element playing, and the whole game (engine included) was silent. R off/on did fix it.
- **Expected:** A suspend/resume after focus or visibility changes should resume the context, or at least report the silence honestly.
- **Repro:** In the prototype, run `await AYLMER.G.audio.ctx.suspend(); AYLMER.pause(true); AYLMER.pause(false)`.
- **Confidence:** High for the code path. Medium for how often it happens: Chrome desktop rarely suspends on its own, while Safari/iOS and audio-device changes do.
- **Fix:** Make `resume()` handle `suspended || interrupted` and return the promise. Call it from `pause(false)` and on `visibilitychange` to visible or `focus`. Subscribe `ctx.onstatechange` so the radio emits, and include `ctx.state === 'running'` in `state().on` (or show a "click to restore sound" notice).
- **Validation:** Repeat the probe and expect ctx `running` after unpause with nonzero radio output. Add a Node case with a mock ctx whose state is `interrupted`.

### F3: Autoplay rejection is invisible while driving, and R turns power off instead of retrying (Low)

- **Observed:** On `NotAllowedError`, `playbackError` is set and `wantOn` stays true (`recorded-radio.js:225-229`). `paintRadio` (`main.js:302-314`) ignores `st.error` and shows the station name and track. The toast from `toggleRadio` (`main.js:316-321`) is built before the rejection arrives. The next R calls `toggle()` and powers off, so the listener needs two presses. The pause-menu button already retries (`local-radio.js:36`).
- **Expected:** Plan §5 says to "report playback rejection separately… allow one clear user action to resume".
- **Confidence:** High. Likelihood in the game is low, because power normally comes from a key press or click.
- **Fix:** In `toggle()`, if `playbackError` is present and `wantOn` is true, call `power(true)`, mirroring the button. Have `paintRadio` show `st.error` in `#radiotrack`.
- **Validation:** Simulate the rejection as in my probe and expect one R press to start playback.

### F4: Engine driver is rebuilt for content-identical profiles, twice on a swap to an upgraded car (Low; same family as the fixed bug)

- **Observed:** `setEngineProfile` keeps the driver only when given the same object (`audio.js:175`). `swapCar()` and `enterDrive()` pass the stock `spec.sound` (`main.js:1262`, `:993`). The following frame, `retune()` passes the tuned `w.sound` (`economy.js:188`). The result is 2 builds, each restarting the voice gain from 0. A repaint or restore clears `cache.key` (`economy.js:412`, `:512`), which makes a new `tunedSound` object for an upgraded car and triggers another rebuild with an unchanged sound.
- **Impact:** Bounded, one or two rebuilds per event rather than per frame, so it is a short gap or click, not a silent driveway. The report's sentence "reapplying an identical audio profile also preserves the running driver" is true only for the identical object.
- **Fix:** Have `swapCar`/`enterDrive` ask economy for the tuned sound, or call `retune()` right after building the vehicle. In `retune()`, keep the previous `cache.sound` when `tunedSound` inputs (the `moteur` level) are unchanged. Optionally give `setEngineProfile` a cheap value key (for example `JSON.stringify` cached on the profile).
- **Validation:** The probe should count 1 build per swap. Keep the existing "Ordinary game frames do not rebuild the engine" check.
- **Confidence:** High (measured).

### F5: Regression protection for the silent-driveway bug is browser-only and timing-sensitive (Low)

- **Observed:** The bug was that `retune()` compared the weather/skills clone and rebuilt every frame. `tools/smoke_vehicle_spec_layers.mjs` checks only that the derived sheets keep their fields. No Node test drives `installEconomy`'s `retune()` over many ticks with a wet weather clone and counts `setEngineProfile` calls. The only guard is `integration-vehicle-audio.html`. That page samples 200 ms after entering drive, and it failed its first check under SwiftShader because the game had not yet stepped.
- **Fix:** Add a Node test: a mock `audio.setEngineProfile` counter, run the `tick()` layering (`v.spec = skills.specFor(weather.specFor(v.baseSpec))`) and `retune()` for 120 frames with `weather.wet=1`, and assert 0 extra calls, then exactly 1 after a mods change. In the harness, wait for `a.voice.nodes.out.gain.value > 0.05` (or N stepped frames) before the idle sample.
- **Confidence:** High.

### F6: Legacy cassette migration skips known-filename matching, and migration is untested (Low)

- **Observed:** `readLibrary()` maps the old IndexedDB `playlist` entry to `personal-cassette` rows with `personal-…` ids (`src/game/radio-storage.js:21-22`). Someone who imported the archive MP3s into the old cassette will find them all on the personal cassette, not on CHEZ, CBC and the other presets. This matters when the `--audio-dir` server is not used (for example on another port). Filename matching exists only in the new import handler (`local-radio.js:96`). The old entry is correctly preserved, not deleted. The Node suite's "migration state" label covers the settings object only, not IndexedDB.
- **Fix:** In the migration branch, match `file.name` against `RECORDINGS[].filename` to take the known id and `stationId`. Add a browser-harness case that seeds `playlist` and checks the result.
- **Confidence:** High (code). No live legacy data was available to test.

### F7: Failure recovery is session-permanent and jumps to the first station (Low)

- **Observed:** Every media `error` adds to `failed` for the session (`recorded-radio.js:200-208`), including a transient loopback-server hiccup. Only reload or re-import clears it. When a whole station fails, `ensureSelection()` picks `list[0]` (CHEZ) rather than the next station (`:94-97`). If several files fail in a row, the notice keeps only the last one.
- **Fix:** On whole-station failure, advance in dial order. Clear `failed` for the selected station on an explicit R or power action (still bounded, because it is user-driven). Keep a failure count in the notice.
- **Confidence:** High (observed in the probe).

### F8: `toMenu()` briefly starts the radio (Low)

- **Observed:** `toMenu()` calls `pause(false)`, which calls `radio.resume()` and then `restart()`. With no old session, that immediately creates a media element and source and starts a load. Then `radio.suspend()` retires them (`main.js:2873-2877`). No sound comes out, because of the request token and the 0 gain, but it adds one retained element per menu trip (F1) and a wasted range request.
- **Fix:** Suspend the radio before `pause(false)`, or give `pause()` an option not to resume the radio.

### F9: Look-back arbitration edge cases (Low/Info)

- **Observed:** `main.js:1827` sets `G.lookBack = false` on Shift+R in toggle mode as well, so a deliberately latched rear view is cancelled (measured). In toggle mode, Shift used with any other key (Shift+W) still toggles on release (`input.js:34`, measured `true`).
- **Fix:** Clear `lookBack` only in hold mode. Set `shiftPending = false` on any non-Shift keydown while Shift is held.

### F10: Focused buttons are not filtered (Info)

`input.js:18` skips INPUT, TEXTAREA, SELECT and contenteditable, which covers the required text and range cases (verified). A focused `<button>` still passes R through (measured: power toggled). Buttons live in the pause menu, which hides when play resumes, so the risk is low. Optionally add `BUTTON`/`SUMMARY`, or blur the active element on resume.

### F11: Road/tyre noise has no channel of its own (Info)

`RoadDriver` connects to the effects bus (`audio.js:151`), and so do skid and spray (`weather.js:517`). Effects=0 therefore silences road and tyres, while engine=0 leaves them. That matches the code comment ("effects the horn / tyres"). If "road" is meant to be independent of horns and crashes, add a `roadBus` and a slider. Ambience (rain, roof, birds, water, thunder) is separate on `ambienceBus` and was unaffected by the other sliders.

### F12: Fade-window state mismatch (Info)

During the 100 ms fade after a tune, `this.session` is still the outgoing station while `selectedStationId` is the new one. `state().position` (`recorded-radio.js:62`) shows the old station's time, and `seek()` (`:127-136`) would move the outgoing element. This is cosmetic, and only on a seek within 100 ms of a tune. Fix: have `seek()`/`state()` ignore a session whose `stationId !== selectedStationId`.

## Report claims checked

- "12 dedicated browser checks", "16 checks", "eight checks" and the recorded-radio suite: reproduced, with numbers within a few percent of the report (idle 0.0105 vs 0.0102; reverse 0.0324 vs 0.0320 at 5.90 km/h).
- "Reapplying an identical audio profile also preserves the running driver": only the same object (F4).
- "Attach handlers once, clean up nodes and URLs": URLs yes, nodes and elements no (F1).
- "Migrate the old cassette store": preserved, but not mapped to presets, and untested (F6).
- "Mixed peaks approximately 0.274 and 0.309": I got 0.230 and 0.309. They are measured after the master compressor, so they show the limiter works, not that the pre-compressor sum has headroom.
- "Changes remain local and uncommitted": outdated. They are in checkpoint commit `2450952`.
- CKMF is labelled "Énergie Montréal · CKMF 94.3"; "CKTF" appears nowhere in `src/`. The preset order is CHEZ, CBC Radio One, Radio-Canada, Oldies 1310, CKMF (`radio-library.js:2-44`). Majic and Live 88.5 are disabled by default and the Bud Light spot is unassigned.

## What signal measurement cannot prove

RMS and peak meters show that a branch makes sound, that a slider or pause reaches zero, and that the compressor output stays below full scale. They cannot show:

- whether the engine sounds like a 1993 Ranger;
- whether CBC speech stays intelligible through the 2.4 kHz driver's-seat cabin filter and engine ducking;
- whether the per-file gain offsets sound even across stations;
- whether the 100 ms fades click on real speakers;
- whether the ambience is pleasant or tiring over an hour.

Nobody listened in this review, headless Chrome has no audio device, and there was no multi-hour soak. The heap figures (about 1.0 GB) cover the whole game, not audio alone. A human listening pass on Thomas's speakers or headphones is still required before calling the mix done.
