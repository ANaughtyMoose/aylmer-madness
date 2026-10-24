# Aylmer Madness — audio implementation and verification

Completed implementation pass: 28 September 2026. The separate full-team game review has not been started.

## Play it

Open **http://localhost:8141/prototype.html** while the local server is running. The five default stations are already connected to the existing private audio directory on this computer. They do not require another download or an import on this server.

- **R:** radio on/off, retaining the current station and position.
- **Shift+R:** next available station; while off it changes the selection silently.
- **Escape → Radio:** power, next station, direct selection, seeking, speech-friendly mix and the local library.
- **Escape → Options:** master, engine, effects, radio and ambience levels.

Default presets: CHEZ 106; CBC Radio One (three programmes); Radio-Canada; Oldies 1310; Énergie Montréal / CKMF. Each playlist wraps at its end. Majic's short excerpt and Live 88.5's explicitly later archives are optional; the standalone Bud Light spot remains unassigned. Personal imports can be assigned to any station or the personal cassette.

To restart the server, run from the repository:

```sh
node tools/serve.mjs 8141 --audio-dir /Users/thomaslever/.gemini/antigravity-ide/scratch/audio
```

Repository: `/Users/thomaslever/Documents/Codex/2026-09-18/al/work/aylmer-madness`.

Without `--audio-dir`, the game still supports browser-local file imports. Use the same browser and localhost origin/port to retain those imports. Game-save exports contain no audio. The original `index.html` keeps its synthetic radio; the recorded library is integrated into the separate visual prototype. Both entries now separate R power from Shift+R tuning.

## Implemented

### Recorded radio

A dedicated recorded player owns one active media source and reuses the existing Web Audio radio bus. Long recordings stream through HTML media elements instead of being expanded into full-length decoded buffers. Stable station and recording IDs preserve positions through tuning, power changes, pause, vehicle swaps and reloads. Inactive stations stay frozen. Playback stays at normal speed regardless of the game clock.

Station changes fade the outgoing source before starting the new one. Request tokens reject stale playback callbacks. Natural end events advance a playlist or loop a single recording. Missing/corrupt files are excluded from the current session so recovery terminates; a skipped-file notice remains visible. An empty library stays silent with an import instruction. Browser autoplay rejection prompts an explicit play action rather than claiming the radio is playing.

The library keeps the previous cassette storage intact, supports importing/replacing files, filename-based station assignment, manual reassignment, removal of browser imports, optional presets and metadata-only export. Private recordings stay outside the repository. The optional development server exposes only the known recordings over loopback, supports byte-range seeking, rejects cross-site requests and excludes the media/reference directories from deployment.

### Controls and presentation

Shift+R is consumed as one command. Both Shift keys work. Shift alone still supports held look-back and the optional toggle mode; the latter toggles on release so a radio chord cannot latch it accidentally. Text fields and native settings controls no longer capture driving/radio shortcuts. Help text includes both radio bindings.

The pause menu includes a compact radio section and library. The prototype tools offer a shortcut to that section. Station changes briefly show the actual selected station; the existing radio HUD displays the recording title without inventing a song title or a live-broadcast schedule.

### Mix and sound polish

All 15 supplied files were fully decoded and measured. The source loudness spans **-27.45 to -1.71 LUFS**. Per-file gain aims near -18 LUFS while preserving at least 1 dB of measured true-peak headroom where possible; peak-limited speech files are left quieter rather than compressed. Original MP3s are untouched.

The radio volume is applied once, at its mixer bus. Setting it to zero reaches exact silence after a short ramp. Engine-load ducking is modest; horns and existing spoken dialogue take priority. A speech-friendly option raises radio intelligibility. Recorded stations do not generate fake DJs, extra static, synthetic idents or additional advertisements.

The prototype adds a quiet procedural outdoor bed, sparse daytime birds outside the cabin and marina water that fades with distance. Existing rain and tyre spray are reused rather than duplicated. Rain/roof balance follows the cabin, and ambience has its own saved slider. Engine/road update timing uses the simulation timestep. Collision and traffic-horn repetition is bounded, UI blips have a voice limit, and several effects that previously bypassed the effects slider now use it. Engine profiles and existing tyre/surface synthesis are preserved.

## Driveway engine-silence correction

The first listening pass exposed a missed integration bug: economy compared the current vehicle spec with its upgrade spec each frame, while weather and skills supplied a different derived spec. This repeatedly disposed and recreated the engine driver with its output gain at zero. The browser reproduction showed a running AudioContext and rising RPM/speed, but zero engine voice gain.

Economy now compares and updates the stable dry `baseSpec`; weather and skills continue deriving their temporary specs from it. Reapplying an identical audio profile also preserves the running driver. Weather, skills and empty-tank overrides also preserve inherited stock fields on upgraded specs; object spreads were dropping those fields and allowing non-finite driving/RPM after tuning in rain. Earlier radio/mixed-output checks did not establish that the engine itself was audible. A dedicated browser regression, `tools/integration-vehicle-audio.html`, now meters the engine and road branches separately with radio off, and checks idle, reverse, rain, pause/resume, upgrades and vehicle swaps.

The corrected build passed all **12 dedicated browser checks**. Separate engine RMS was 0.0102 at idle and 0.0320 while reversing at 5.90 km/h; the road branch measured 0.000321 RMS. Pause output was zero, and returning to the Ranger after an upgrade and vehicle swap restored 800 RPM and nonzero engine output. These are signal measurements, not a subjective listening review. The final automated run passed **59/59 suites**, including the new vehicle-spec-layer regression.

## Verification

### Automated regression

- Baseline: **57/57 suites passed** before edits.
- Implementation regression: **58/58 suites passed**, including the new recorded-radio/input/ambience suite.
- Existing audio checks: **112 passed, 0 failed** on a subsequent focused run.
- Existing save/settings checks: **358 assertions passed** after adding ambience settings.
- Existing shell checks: **624 assertions passed** after changing the expected radio control contract.
- Added state-machine checks cover per-station resume, one-file and CBC loops, off-state tuning, pause/hidden state, seeking, unavailable storage, failed files, autoplay rejection, stale callbacks and both Shift keys.

Two old assertions were updated because the intended behavior changed: station cycling moved to Shift+R, and the settings mixer gained an ambience channel. Other failures found during development were fixed, including a loading source overwriting its saved position with zero and range-input shortcuts leaking into gameplay.

### Real browser playback

The in-app Chromium browser ran `tools/integration-recorded-radio.html` against the actual local MP3s. Passed checks include all five presets' real durations, seeking, off/on resume, end transitions, the three-recording CBC cycle, restored state, pause silence, zero radio-volume silence, off-state tuning, rapid switching and a complete 10-second file advancing naturally without seeking.

Mixed engine/horn/impact checks with CHEZ and CBC recorded output peaks of approximately **0.274 and 0.309**, below digital full scale. These are sampled peaks from those scenarios, not a guarantee about every moment of the game. Forty further station transitions produced **68 media elements in total across the test**, with **at most one active source**; 67 were retired during playback and all released their source URLs after stopping.

`tools/integration-audio-game.html` exercised real keyboard events inside an isolated review profile: R and both Shift+R variants, hold/toggle look-back arbitration, text-entry protection, game-clock independence, pause-menu tuning, frozen paused positions a Ranger-to-Saturn swap and back, road reset, and an actual page reload. Its 16 checks passed. The final reload restored Oldies from 72.137 seconds to 72.213 seconds. Test profiles and test-library storage are separate from the normal prototype.

`tools/integration-radio-library.html?audioReview=1` verified known-filename assignment, blob playback sources, stored file bytes, optional station activation, a personal file and manual reassignment. Its eight checks passed. The full imported audio remains local.

Server checks confirmed valid byte ranges return 206, invalid ranges return 416, unknown recording IDs return 404, and cross-origin and hidden Git-file requests return 403.

### Moving-scene spot checks

Six seconds of driven motion were sampled at each of three locations, with playback active. These are separate segments after positioning the car, not a complete continuous route or an extended soak. The measurements are browser animation-frame intervals and include long-frame counts.

| Segment | Conditions | Frames sampled | Median | p95 | Longest | Over 250 ms |
|---|---|---:|---:|---:|---:|---:|
| Fraser | Clear, noon | 355 | 16.7 ms | 17.1 ms | 17.8 ms | 0 |
| Principale | Rain, 17:00 | 350 | 16.7 ms | 17.1 ms | 50.0 ms | 0 |
| Marina | Clear, midnight | 355 | 16.7 ms | 16.9 ms | 17.6 ms | 0 |

Radio playback continued in all three samples. Browser-reported heap ranged from roughly 1.0 to 3.1 GB across repeated loaded test sessions, falling after garbage collection; that includes the heavy game/test context and is not an audio-only memory measurement. No before/after memory attribution or long-session leak-free claim is made.

## Scope and remaining listening work

The audio implementation is ready for a user listening/playtest pass. Technical decoding, playback, transitions, levels and controls were checked. I have not independently listened through every recording, authenticated every date/song/advertisement, or confirmed absence of modern ads. The imported source report was reviewed as provenance, not treated as independent authentication.

There was no human subjective audition of the final engine/radio balance on your speakers or headphones. The calibrated levels and automated headroom checks are a starting mix, not a claim of a finished professional audio master. No new songs, broadcasts, voices or commercial assets were acquired. New music sourcing, a simulated live schedule and elaborate custom ad programming remain deferred as planned.

Extended multi-hour driving, every browser/device/controller, exhaustive mission/tow combinations, and a full before/after performance study remain outside this bounded implementation verification. The later team-review prompt is saved and untouched; no agents were launched for it.

## Main code locations

- `src/game/recorded-radio.js`: playback state, loops, fades, resume, recovery and mix.
- `src/game/radio-library.js`: measured recording metadata and preset order.
- `src/game/radio-storage.js`, `src/prototype/local-radio.js`: private imports and controls.
- `src/core/input.js`, `src/main.js`, `src/game/i18n.js`: shortcuts and integration.
- `src/core/audio.js`, `src/core/ambience.js`, `src/game/weather.js`: mixer, bounded effects and ambience.
- `src/game/store.js`, `src/game/options.js`: persistent ambience volume and mixer settings.
- `tools/serve.mjs`: opt-in loopback-only media serving with range support.
- `tools/smoke_recorded_radio.mjs` and three `tools/integration-*radio*.html` / `integration-audio-game.html` pages: verification.

Changes remain local and uncommitted; unrelated existing story documents and edits were preserved. Nothing was published or deployed.
