# Audio clarity repair and next sound pass

## State

The owner's approved gameplay and Mac documentation were merged in PRs #42 and #43. Main at that point is `e68be00363e9db75d87e7b33caa298e2b5a3c6c6`. Gameplay matched the locally opened `611b3be`; intervening differences were documentation only. Branch protections were not changed.

This follow-up is on `codex/audio-static`. It addresses the report of static masking a faint engine. It is a mix correction, not a completed recording-based audio overhaul. Submit for review; the previous administrator-merge permission was specific to #42/#43.

## Findings and change

- The shared engine graph multiplied its exhaust, intake and tick by clutch engagement. At full disengagement the firing sound vanished, while road noise could continue. Launch also attenuated the engine twice.
- Preserve an audible firing note when disengaged; engine load still falls and the pitch/timbre still change. Engine-off and pause silence remain explicit gates.
- Trim continuous intake hiss and exhaust noise to 18% of their former gain (about 15 dB lower before nonlinear processing). Retain tonal waveshaping, overrun pops, mechanical tick and surface sounds.
- Change is shared by all engine profiles. No saved volume preferences are overwritten.
- Measurements are evidence about the rendered graph, not proof of what the user's particular speakers output. The agent could not directly listen to the user's speakers. Other possible sources (radio reception hiss, weather, audio-device faults) have not been confirmed as the reported source.

## Reproduce and review

1. Serve this branch using the Mac guide. Hard-refresh the game to load the revised JS.
2. Open `/tools/integration-engine-clarity.html` and press **Render and check engine clarity**.
3. This renders all registered profiles plus the NSX and police cruiser, serially to limit memory. Samples include idle, drive, a clutch dip and acceleration, with the real road voice.
4. Check the displayed pass result: continuous noise below 15% of the tonal RMS above 250 Hz; a nonzero firing note during the clutch dip; silence after engine-off; no sample clipping.
5. Audition the samples, then drive the game with radio off, stationary and accelerating. Compare headphones and small speakers. Verify radio, weather and tyre sounds separately; check pause/resume. The page is a sound-graph test, not a substitute for this subjective in-game review.
6. To compare the original graph locally, create `out/audio-before-static.js` using `git show e68be00:src/core/audio.js` (UTF-8), then open the page with `?baseline=1`. The `out` directory is ignored. Original profiles lose all tonal sound at zero clutch; the new regression detects that.

Browser result: all 18 profiles passed. Worst continuous-noise ratio above 250 Hz was 0.139 (city bus); Ranger was 0.061. Clutch-dip tonal RMS remained 0.258–0.296 of the engaged reference instead of zero. Largest mixed-sample peak was 0.289, safely below clipping. These are serial 48 kHz OfflineAudioContext renders, not captured speaker audio.

Node checks: `node tools/smoke_audio.mjs` (29 gearbox/profile checks; legacy WAV tests skip because recordings are absent) and `node tools/smoke_radio_resume.mjs` (passes). Browser offline rendering checks the actual revised sound graph. Live browser mixer check also passed: radio output 0.0139 RMS, paused/muted exactly zero, resumed/restored above 0.012. No new Actions workflows or CI runs were requested.

## All-vehicle recording upgrade

The owner explicitly wants excellent audio for **all vehicles**, not only the Ranger. The ready-to-send research prompt is [GEMINI-AUDIO-SCOUT-PROMPT.md](GEMINI-AUDIO-SCOUT-PROMPT.md). It includes all 18 entries, source/license verification, precise-match versus substitute labels, and shared environmental/impact sounds. No recordings have been sourced or integrated yet.

Implementation order once candidate recordings arrive:

1. Audit licensing and loop quality; retain creator/source/license/attribution per asset. Public source hosting requires actual redistribution permission.
2. Prove one coherent RPM/load loop set in the Ranger, retaining a procedural fallback. Crossfade adjacent RPM bands, blend loaded/coasting layers, preserve transient starts/shifts, remove loop seams and control summed loudness.
3. Extend distinct profiles to every vehicle: gasoline fours, boxer, V6s, V8 police, diesels, electric cart and bicycle mechanics. The SVX, NSX and police data currently use legacy sound fields that the modern graph largely ignores; the resulting default four-cylinder fallback needs explicit replacement. The city bus was rebodied as a GM New Look but still inherits a generic diesel profile; research its engine before claiming fidelity.
4. Add restrained road, suspension, breakaway-object, debris and chained-spare layers. Keep engine readability across camera views and speaker sizes. Spatialize nearby traffic within a voice budget.
5. Test pause/focus loss, mute and category sliders, car swaps, sustained driving, clipping, seams, frame pacing and memory on the MacBook Air. Subjective listening is a required acceptance step; numeric checks alone cannot certify excellent sound.

Do not import personal photos, commercial pack source files or unlicensed recordings into the public repository. Do not automatically merge the follow-up audio PR.
