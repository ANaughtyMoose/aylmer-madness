# Aylmer 2004 prototype — active backlog

Last updated: 2026-09-28. Source of truth for the separate visual branch, not the production roadmap. Read with PROTOTYPE-SESSION-LOG.md. Keep completed entries and add dated evidence; do not turn tentative ideas into user decisions.

## User decisions confirmed

- Separate version; preserve Aylmer 2004's local identity, story and existing driving.
- Target the familiar early-2000s PC look of Midtown Madness 2 San Francisco; avoid modern gloss. Paul permits sharing his approach/assets.
- First day begins 06:00, June 26, 2004. Date advances at midnight. Every subsequent day is a full 24-hour cycle. Default 24 real minutes; retain slower 48-minute option.
- Jobs must not consume calendar days or reset the hour. Historical dated weather should drive the environment.
- Improve houses using Thomas's shared photos. Weird/repetitive textures are a priority. People remain deferred.
- Radio should feel like actual period listening: good music, station presentation, ads and real recordings. Local MP3 playback is wanted; service options requested.
- Maintain a detailed running backlog and session summary for future sessions.

## Completed in the prototype

- [x] Three.js r170 renderer adapter; original entry remains available.
- [x] Near-player sun shadows, light-space stabilization, warm headlights, six local streetlights, readable night fill.
- [x] Continuous 24-hour sun/sky; 12/24/48-minute review controls, fixed time, accelerated preview.
- [x] Prototype save namespace and exact saved visual hour; mission resume preserves that hour.
- [x] Omit unused UV/atlas buffers, reuse materials/objects; initial estimated geometry 348→270 MiB.
- [x] Four San Francisco reference images and further cockpit/vehicle links.
- [x] First-day 06:00, midnight date rollover, no mission time jumps or job day charge; full final Labour Day before ending.
- [x] Connect summer2004.json daily sky to weather, disable random weather changes in prototype. Daily sunrise/sunset anchor solar direction.
- [x] Correct photographic material repeat scale for siding/clapboard/cedar and brick. Prevent projected road/grass textures from affecting atlas-textured roofs.
- [x] Local audio file picker, browser-local persistence, play/next/stop, playback errors. Files stay outside GitHub and the server.

- [x] Four Glenwood reference photos preserved locally; broad low bungalow geometry, grouped windows, carports/garages, shallow steps, muted panels and limestone courses. Prototype-only, within existing geometry budgets.

## Next — highest value

| Priority | Work | Acceptance / evidence needed |
|---|---|---|
| P1 | Recover remaining Principale photo attachments | Four Glenwood screenshots received and preserved; see GLENWOOD-PHOTO-PASS.md. Earlier Principale originals remain unavailable; written descriptions alone are not photo evidence. |
| P1 | Author one representative Principale block from photos | Thomas approves façade proportions, window rhythm, porches, roofs and signs at noon/dusk/night before spreading changes across town. Correct repeat scale is only the first repair. |
| P1 | Validate material appearance at driving distance | Compare brick dimensions, siding boards, roof shingles, tint and mip shimmer while moving; capture same-location before/after. Avoid wood grain on vinyl and excessive baked lighting. |
| Done for now | Acquire initial radio library | Fifteen local MP3s checked on September 22. User says these clips are enough; stop further acquisition. Dates/content still carry source-verification limits. Next work is preset integration. |
| Done | Implement recorded station loops | Five default presets, R power / Shift+R tuning, loops/resume, private library, calibrated gains, error recovery and chord arbitration implemented. Real MP3 browser checks passed; see AUDIO-IMPLEMENTATION-REPORT.md. |
| P1 | Audit real station identities/frequencies in summer 2004 | Current station copy mixes fictional and real labels. Do not advertise the existing synth dial as an authentic broadcast reconstruction. |
| P1 | Rebalance the calendar economy | Midnight-based progression removes old per-job farming limit. Preserve current driving; separately assess repeated-job rewards, the $1,200 target and 73-day pacing. |
| P1 | Historical weather fidelity | Current repository data is daily, not hourly: showers are represented as a daily rain state, not an exact rain timetable. Validate source provenance and add hourly observations before claiming hourly reconstruction. Add actual humidity/wind/temperature effects only when useful. |
| P1 | Moving-camera shadow/performance route | Fraser → Principale → marina, clear/wet/night. Measure long stalls, not only eligible sub-250-ms frame intervals. Check open meshes, thin poles, floating edges and shadow fade. |
| P2 | Improve trees and sky/cloud artwork | Keep period-appropriate geometry; compare silhouette and overdraw/shadow cost. |
| P2 | Streetlamp occlusion | Six point lights currently spill through walls; evaluate selective shadowing or cheaper occlusion. |
| Done | Radio seek/metadata/loudness UX | Pause radio section, file title/time, seek, measured gain, unavailable-file handling, optional stations, assignments and metadata-only export implemented. Browser files remain origin-specific and outside game saves. |
| P2 | Night-only mission semantics | Clock now stays continuous, so any narrative requiring night needs a wait/sleep mechanic or eligibility rule rather than a hidden time jump. |
| P2 | Summer end / free-roam date policy | Campaign completes after Sept 6; post-ending free roam keeps the last supported date. Extending beyond summer needs more weather records and a deliberate calendar rule. |
| Deferred | New people, heavy post effects, real-time mirrors | User explicitly deferred people; bloom/motion blur remain off. |

## Helpful input, when convenient

1. Feedback on the new Glenwood proportions; no more Glenwood photos needed to continue. Earlier Principale originals would help its later façade pass.
2. Favourite stations, DJs and three to five songs that immediately say “Aylmer summer 2004”. A whole original recording is even better.
3. Reaction to the same corrected street in daytime and night: too glossy, too clean, too dark, too much texture, or wrong house proportions.


## Updated radio scope — 19 September 2026

Read RADIO-SEARCH-UPDATE.md for current instructions and findings. Personal research only; NO OUTREACH. CHEZ, English/French CBC and Live 88.5 musical feel prioritized; Canadian music and funny period ads; broadcast/game-clock mismatch accepted. Earlier outreach suggestions are superseded. Public WireTap media/RSS collection found but playback/ad audit incomplete. Other requested recordings not yet verified. Gemini prompt updated for YouTube/RSS and no messaging.


## Gemini report audit and earlier-date fallback — 19 September 2026

Thomas accepts strong authentic 2002–2003 audio, with 2004 still preferred. No outreach; clock mismatch accepted. Read RADIO-GEMINI-AUDIT.md: supplied report contains useful leads but unsupported playable labels, durations, prices and holdings claims. Preserve the report privately; do not promote its assertions to verified facts. No new suitable audio verified or acquired in this audit.


## Story collaboration — 21 September 2026

User requests a detailed Claude prompt and our own story pass. Constraint: don't rethink levels; only small tweaks, with anecdotes making individual missions easy to guide. Created CLAUDE-STORY-PROMPT.md, STORY-DIRECTION-AND-MISSION-CARDS.md and STORY-MISSION-INVENTORY.json. Runtime inventory has 28 campaign missions and five gated arc beats; older 18-mission JSON is not authoritative. Preserve owned Ranger, $1,200 goal, current driving and mission structure. Flag inconsistent Margaret portrayal, old borrowed-keys copy, generic shared character voice, summer-school premise and progress/calendar mismatch for clarification. User memories outrank generated prose. All new dialogue is labelled proposal, not approved biography. No gameplay edits or submission to Claude. Next: gather three anchor anecdotes and actual character language/relationship details; review one existing mission card at a time.


## Local radio recordings acquired — 22 September 2026

Thomas supplied Gemini's completed acquisition report. Independently checked /Users/thomaslever/.gemini/antigravity-ide/scratch/audio: all 15 reported MP3 files exist and ffprobe recognises their MP3 audio streams/durations. Detailed local verification: outputs/Radio-local-file-verification.json in the parent workspace. Original supplied report saved privately in references/radio/gemini-acquired-audio-report-2026-09-22.txt. These findings supersede earlier statements that no actual files had been acquired.

Key files: CHEZ 106.1 Ottawa - August 20, 2004 (37:33); CIWW Oldies 1310 Ottawa - August 19, 2004 (43:26); CKMF Montréal 2004 (31:45); two CBC WireTap episodes (27:04 and 22:16); CBC Mystery Project (28:21); Radio-Canada Macadam tribus / Abla Farhoud (11:23); Majic 100.3 2003 (2:13); Bud Light spot (1:04); six later/current Live 88.5 reference files. Dates and programme descriptions here come from filenames/supplied report, not independent auditory verification.

Verification limits: ffprobe confirms media structure and reported duration, not complete decode/playback, broadcast date, tracklist, Canadian-content qualification or absence of modern ads. A 32kbps mono encoding cannot by itself prove a 2004 encoding date or an ad-free original. Bud Light's claimed CHEZ rotation remains unverified. CKMF Montréal must retain its real identity rather than be relabelled CKTF Gatineau. Later/current Live 88.5 remains reference material, not period broadcast evidence. No game preset integration was performed or verified by this task; the report's implementation section is a proposal. Keep personal audio outside public GitHub/bundles. No outreach.

Next useful work if requested: verify source-to-file provenance and audition, then connect station presets to the private local library, preserving source labels and normal audio speed. Avoid restarting the earlier broad acquisition search before using these files.


## Current priorities — 22 September 2026

RADIO-CONTROLS-PLAN.md proposes R/Shift+R station presets with per-station resume and an Off slot, using the acquired local library. Design only, not implemented. Await user story revision; preserve existing levels. Next independent work: recorded presets, driving-route shadow/performance review, neighbourhood trees/landscaping, then calendar/economy consistency. Existing Claude story ledger/script/research files are present locally; do not overwrite or implement those drafts without reviewing the incoming user direction.


## Confirmed audio controls and detailed plan — 27 September 2026

Thomas requests planning only: R toggles on/off; Shift+R changes station; loop each station's available recordings until more audio exists. AUDIO-IMPROVEMENT-PLAN.md defines the lineup, exact state behavior, persistence, mix, vehicle/environment sound improvements, delivery sequence and validation. Recommended defaults are labelled separately from confirmed decisions. This supersedes the September 22 dial controls and Off-slot design. No runtime changes performed.

POST-AUDIO-TEAM-REVIEW-PROMPT.md is a future user-invoked prompt for a coordinated specialist-agent review after audio implementation, covering story, gameplay, code simplification, performance, UX and QA. Saved only; no review team started.


## Audio implementation — 28 September 2026

Implemented AUDIO-IMPROVEMENT-PLAN.md in the visual prototype: five recorded stations loop locally; R power and Shift+R station selection; per-station resume, migration-compatible imports, pause controls, optional Majic/later-Live presets, gain calibration and source cleanup. Local server on 8141 can link the existing private audio directory without copying media into the repository. Both original/prototype help and keyboard controls updated. Full regression passed 58/58 suites. Actual-MP3 playback/loop/mute/stress checks, eight import checks and 16 in-game control/reload/car-swap/scene checks passed. Added quiet outdoor/marina ambience and its volume control; reused weather sound and corrected effects routing. Read AUDIO-IMPLEMENTATION-REPORT.md for exact evidence and limits.

Next audio step: Thomas's listening feedback; exhaustive broadcast-content authentication and long-session performance remain unclaimed. Story unchanged. POST-AUDIO-TEAM-REVIEW-PROMPT.md remains saved for a later explicit invocation; no team review launched.
