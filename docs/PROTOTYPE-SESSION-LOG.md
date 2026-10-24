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

## 2026-09-19 — radio procurement plan

Added RADIO-ACQUISITION-PLAN.md and GEMINI-RADIO-RESEARCH-PROMPT.txt after live research. First proposed milestone: one 60–120 minute complete summer-2004 aircheck. HisAir lists CHRI Ottawa July 2004, but the file is unverified; McMaster supplies Ottawa ad catalogue leads. Plan includes collector/former staff/archive outreach drafts, provenance, date tolerance, access versus reuse and compressed-clock conflicts. No outreach sent, purchases made or authentic recordings acquired. Pending preferences: first station, fallback dates and optional digitization budget.


## Updated radio scope — 19 September 2026

Read RADIO-SEARCH-UPDATE.md for current instructions and findings. Personal research only; NO OUTREACH. CHEZ, English/French CBC and Live 88.5 musical feel prioritized; Canadian music and funny period ads; broadcast/game-clock mismatch accepted. Earlier outreach suggestions are superseded. Public WireTap media/RSS collection found but playback/ad audit incomplete. Other requested recordings not yet verified. Gemini prompt updated for YouTube/RSS and no messaging.


## Gemini report audit and earlier-date fallback — 19 September 2026

Thomas accepts strong authentic 2002–2003 audio, with 2004 still preferred. No outreach; clock mismatch accepted. Read RADIO-GEMINI-AUDIT.md: supplied report contains useful leads but unsupported playable labels, durations, prices and holdings claims. Preserve the report privately; do not promote its assertions to verified facts. No new suitable audio verified or acquired in this audit.


## Story collaboration — 21 September 2026

User requests a detailed Claude prompt and our own story pass. Constraint: don't rethink levels; only small tweaks, with anecdotes making individual missions easy to guide. Created CLAUDE-STORY-PROMPT.md, STORY-DIRECTION-AND-MISSION-CARDS.md and STORY-MISSION-INVENTORY.json. Runtime inventory has 28 campaign missions and five gated arc beats; older 18-mission JSON is not authoritative. Preserve owned Ranger, $1,200 goal, current driving and mission structure. Flag inconsistent Margaret portrayal, old borrowed-keys copy, generic shared character voice, summer-school premise and progress/calendar mismatch for clarification. User memories outrank generated prose. All new dialogue is labelled proposal, not approved biography. No gameplay edits or submission to Claude. Next: gather three anchor anecdotes and actual character language/relationship details; review one existing mission card at a time.


### Claude handoff clarified

Updated CLAUDE-STORY-PROMPT.md and its outputs copy to reference Codex’s independent story pass, runtime inventory, running log and backlog with exact local paths and a reading order. Claude must distinguish proposals from confirmed memories, assess the existing work, and request attachments if it cannot read local files. Explicitly notes local story docs may not be on the remote PR.


## Local radio recordings acquired — 22 September 2026

Thomas supplied Gemini's completed acquisition report. Independently checked /Users/thomaslever/.gemini/antigravity-ide/scratch/audio: all 15 reported MP3 files exist and ffprobe recognises their MP3 audio streams/durations. Detailed local verification: outputs/Radio-local-file-verification.json in the parent workspace. Original supplied report saved privately in references/radio/gemini-acquired-audio-report-2026-09-22.txt. These findings supersede earlier statements that no actual files had been acquired.

Key files: CHEZ 106.1 Ottawa - August 20, 2004 (37:33); CIWW Oldies 1310 Ottawa - August 19, 2004 (43:26); CKMF Montréal 2004 (31:45); two CBC WireTap episodes (27:04 and 22:16); CBC Mystery Project (28:21); Radio-Canada Macadam tribus / Abla Farhoud (11:23); Majic 100.3 2003 (2:13); Bud Light spot (1:04); six later/current Live 88.5 reference files. Dates and programme descriptions here come from filenames/supplied report, not independent auditory verification.

Verification limits: ffprobe confirms media structure and reported duration, not complete decode/playback, broadcast date, tracklist, Canadian-content qualification or absence of modern ads. A 32kbps mono encoding cannot by itself prove a 2004 encoding date or an ad-free original. Bud Light's claimed CHEZ rotation remains unverified. CKMF Montréal must retain its real identity rather than be relabelled CKTF Gatineau. Later/current Live 88.5 remains reference material, not period broadcast evidence. No game preset integration was performed or verified by this task; the report's implementation section is a proposal. Keep personal audio outside public GitHub/bundles. No outreach.

Next useful work if requested: verify source-to-file provenance and audition, then connect station presets to the private local library, preserving source labels and normal audio speed. Avoid restarting the earlier broad acquisition search before using these files.


## Radio interaction proposal — 22 September 2026

User confirms recordings are enough for now and is editing the story. Checked current radio implementation: R cycles synthetic dial; local player remains a single cassette. Added RADIO-CONTROLS-PLAN.md for R/Shift+R recorded presets, Off, short station display and per-station resume. No code changed. Local Claude story-ledger/script/research files observed; preserved pending user story handoff. Updated top-level backlog to stop claiming acquisition is still missing.


## Audio improvement planning — 27 September 2026

Inspected radio, local imports, audio buses and main input/pause hooks. Confirmed Shift conflicts with look-back and existing toggle cycles stations. Saved detailed AUDIO-IMPROVEMENT-PLAN.md, updated RADIO-CONTROLS-PLAN.md and backlog to R power / Shift+R station. Plan uses five main recorded loops and optional Majic/later Live presets; includes validation, mix and environmental/vehicle sound passes. Inventory durations come from September 22 probe report; no new playback/content verification claimed. Saved POST-AUDIO-TEAM-REVIEW-PROMPT.md and user-facing copies in September 27 outputs. Documentation only; no implementation or agents launched.


## Audio implementation and verification — 28 September 2026

Completed recorded-radio implementation, requested controls, local library, measured level calibration and restrained sound polish. Baseline 57 suites; full implementation run 58/58. Browser verified actual files and output, all station boundaries/CBC playlist loop, resume, mute, stale-source stress, private import storage, keyboard chords, pause/menu, actual reload, Ranger/Saturn swaps, reset and short clear/wet/night moving scenes. Tested using separate audioReview save/library namespaces. All 15 MP3 files decoded with ffmpeg successfully. Originals untouched. Server links them over loopback with explicit --audio-dir; no deployment or outreach.

Source measurements and user guide/report saved in September 27 workspace outputs; repo companion is docs/AUDIO-IMPLEMENTATION-REPORT.md. No subjective full-recording listening or complete long-session audit claimed. User's future team-review prompt not executed. Existing story drafts and unrelated changes preserved; code remains uncommitted.
