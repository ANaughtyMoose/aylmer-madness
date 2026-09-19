# Aylmer 2004 — running prototype session log

Continue this document in later sessions. Append dated entries; mark previous assumptions superseded rather than silently losing the history. The active work list is PROTOTYPE-BACKLOG.md. User instructions override suggestions here.

## Workspace and delivery

- Repository: ANaughtyMoose/aylmer-madness.
- Branch: codex/2004-graphics-prototype. Draft PR: https://github.com/ANaughtyMoose/aylmer-madness/pull/45. Not merged or production-deployed during this work.
- Local source: /Users/thomaslever/Documents/Codex/2026-09-18/al/work/aylmer-madness.
- Portable deliverables: /Users/thomaslever/Documents/Codex/2026-09-18/al/outputs/aylmer-2004-prototype and sibling ZIP.
- Development server: node tools/serve.mjs 8140. Portable server: node tools/serve.mjs 8141 from the portable directory. Servers may need restarting in a later session.
- Entry: prototype.html. Original renderer: index.html. Reference board: references.html.
- Build: node tools/build-prototype.mjs <output directory>. Bundle includes runtime source/assets/vendor, docs, and Start.command. Do not include personal radio files or raw private/photo reference directories.
- Tests: npm test, node tools/check-prototype.mjs. Browser testing uses the desktop browser tools. Never merge/deploy merely because tests pass.

## 2026-09-18 — first visual prototype (commit 1fbdebb)

### Intent and investigation

Thomas compared Aylmer with Paul's downloaded Toronto Street Circuit, wanted a familiar 2004 arcade look in the spirit of Midtown Madness 2 San Francisco, and explicitly wanted current driving retained. Paul allows sharing. His project uses Three.js r170, physically based materials, texture maps, shadows, atmospheric lighting and effects. Aylmer's original custom renderer had no geometric shadows. The important difference was the combination of materials, geometry and lighting, not the library name alone.

### Implemented

1. Added a Three renderer adapter through a separate entry-point import map. Existing world/car mesh builders and gameplay feed it.
2. Added sun/sky, 2048px player-centred shadow map, light-space snapping, 48–72m fade, actual headlights, local streetlights, ambient night fill and restrained reflections/water normals. Bloom and motion blur remained off.
3. Used existing photographic house atlas and three CC0 ground colour maps from Paul's project. Vendored Three r170 and its MIT license. No Paul-specific gameplay code/models copied.
4. Added adjustable 24-hour lighting and review controls. **Initial assumption now superseded:** the date stayed mission-driven and mission starts selected an authored hour.
5. Isolated save/settings storage using the ayImer2004 prototype namespace (actual code prefix is `aylmer2004.prototype.`). Exact visual hour saves/restores, including mission resume.
6. Avoided per-frame material recreation and omitted unused UV/atlas arrays. Geometry estimate fell from 348 to 270 MiB. A stationary Principale/Bancroft sample (600 eligible frames, 1632×918 internal render) was median 16.6ms / p95 18.3ms. This did not measure long stalls or the full map.
7. Added a source-linked San Francisco reference board, portable builder, decision sheet, tests and screenshots. Draft PR #45 created and attached to the Codex task.

### Evidence and limitations

All 55 suites passed across the full run and targeted fix/rerun of the shell suite; solar/adapter checks passed. Browser review covered loading, saved mission hour, midnight visual rollover, Fraser/Principale/marina, morning/noon/dusk/night and shader errors. The houses/trees still looked basic. Fine geometry and moving shadows require more review. Street point lights do not shadow. No claim was made that this was a completed art rebuild.

## 2026-09-18 — follow-up: calendar, historical weather, houses, audio, continuity

### User corrections and requests

- Start the first day at 6 a.m.; advance the actual date at midnight; complete 24-hour days. Confirmed speed: 24 game hours in 24 real minutes, retaining slower options such as 48 minutes.
- Weather should use the real dates already in GitHub.
- Houses/textures look very weird; use the photos previously shared. User reports a window closed and prefers recovery to another upload.
- Make radio work well with period music, ads and genuine audio; explain services and MP3 use.
- Keep a detailed running summary and backlog for future sessions; say what input would help.

### Findings

1. assets/text/summer2004.json has 73 daily records, June 26–September 6, with daily sky, temperature, precipitation and sunrise/sunset. tools/build_summer2004.py fetches Environment Canada station 4337 and computes solar times. It was connected to date toasts, but the live Weather class still chose random fronts. The stored file is daily: it cannot establish exact hourly rain timing.
2. The photo atlas repeats many siding boards within a 0.6m tile; using those dimensions unchanged creates dense striping. Some vinyl cells originate from strongly shaded wood photographs. Ground projection could also affect atlas-textured surfaces.
3. Existing radio already loads assets/radio/playlist.json and plays real files through Web Audio, but users must manage files/JSON. The station music/DJ implementation is mainly synthetic sound plus written text, not recorded period broadcasts.
4. No original user-image entries exist in the accessible current Codex session. The archived-task list is empty. Relevant image searches in the local workspace/downloads/Codex image locations did not recover the uploaded house photographs. Recovered descriptions: docs/principale-photo-pass.md, assets/text/streetview.json and streetview_pack.json. Some described panorama dates differ between these sources; do not silently present them as proven 2004 imagery.

### Changes implemented

- Prototype calendar-clock module: first game June 26 at 06:00, midnight increments date, no day charge on job completion, no mission time jump. September 6 is playable for a full day before the ending. Existing driving stays intact; production entry retains its prior rules.
- Daily weather is loaded before prototype boot, selects the historical sky and locks out random transitions. Changes of date blend toward the next record. V no longer overwrites historical weather. Panel shows date and recorded daily summary.
- Sun direction aligns with each record's sunrise/sunset. Below-horizon sunlight is suppressed; storm tint no longer lights the night as if it were daytime.
- Photographic brick/siding/clapboard/cedar scale corrected in a prototype-only manifest copy. Decal sizes and original atlas remain unchanged. Projected ground grain excluded from atlas surfaces.
- Added a code-native 16cm horizontal vinyl/clapboard lap treatment with distance filtering and restrained grain to remove strongly baked wood shading from vinyl. This is a material repair, not an authored photo-based façade replacement.
- Added browser-local radio file selection and IndexedDB persistence, local playlist replacement protected against asynchronous server-playlist races, explicit playback errors and actual playback status. Play/next/stop use the existing radio audio path. Personal files do not enter repository/build output. Audio position across browser reloads is still a backlog item.
- Added this running log, active backlog, radio/source plan and links from HANDOFF.md / PROTOTYPE.md. Portable builder includes them.

### Validation record

- Full regression run: 56/56 suites passed (outputs/test-results-calendar-radio.txt).
- New calendar suite covers first 18-hour day, midnight, repeated full days, 48-minute pace, frozen review time, complete final day, all 73 records staying locked, dawn/dusk horizon alignment, original material manifest isolation and local playlist protection.
- Browser observed 06:00 on June 26 with dated showers; crossing midnight changed the HUD/date/weather to June 27; later June 28 used its recorded cloudy state. No shader/console errors at inspection.
- Local WAV fixture imported through the picker and reported persisted; reload/playback and final material screenshots are recorded in the handoff after final verification. The fixture is synthetic repo test audio, not authentic 2004 music.

### Not yet achieved / do not overstate

At this point the earlier photos had not been recovered; this is superseded for Glenwood by the new reference set below. No licensed/authentic 2004 aircheck was obtained, and no Spotify/Apple subscription was connected. The new control is a local player, not a completed broadcast scheduling system. Existing daily weather is used, not newly verified hourly observations. Calendar pacing/economy and night-specific mission stories need deliberate follow-up.

### Next session starts here

Read PROTOTYPE-BACKLOG.md and RADIO-2004-PLAN.md, inspect current PR state and git status, then review the corrected street and local player with Thomas. Use the preserved Glenwood reference set; recover remaining Principale photos before claiming a matching Principale pass. Do not replace the original renderer or merge without an actual adoption decision. Preserve private photos and personal recordings outside public commits.

## 2026-09-19 — Glenwood reference set and first house pass

Four new user-supplied screenshots now unblock Glenwood. Saved outside temporary clipboard storage in references/glenwood; see GLENWOOD-PHOTO-PASS.md for durable paths, reference analysis and scope. Earlier missing-photo findings remain history, not the current Glenwood status.

Added prototype-only low ranch variants, garages/carports, grouped windows, stone/panel combinations, low entrances and restrained roofs. Added filtered limestone courses and corrected vinyl treatment. Separate glenwood-review.html allows visual inspection without loading the entire town. Original renderer retains its previous house builder. Geometry regression covers variants, sizes, sides, seeds and distance levels.

Local radio browser check: imported synthetic repo WAV, reloaded, clicked play and observed actual playback advancing to 3 seconds; stop reported paused at 3 seconds. No console errors. This validates persisted local playback, not authentic programming or an auditory quality evaluation. MP3 uses the same browser audio path; authentic recordings remain to be supplied.

Restart required restoring local servers; no user game save was reset. Refresh the portable prototype to receive the new code; a new game starts June 26 at 06:00, while Continue retains saved progress.

Final validation: 57/57 smoke suites passed (outputs/test-results-final.txt); 8,649 prototype solar/rollover/control/isolation checks passed; git diff --check clean. Browser review of two Glenwood variants rendered correctly with no console errors. Saved screenshot: outputs/glenwood-house-pass.png. Portable directory and ZIP rebuilt from this pass.
