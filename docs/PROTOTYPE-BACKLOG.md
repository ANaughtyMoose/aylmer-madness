# Aylmer 2004 prototype — active backlog

Last updated: 2026-09-19. Source of truth for the separate visual branch, not the production roadmap. Read with PROTOTYPE-SESSION-LOG.md. Keep completed entries and add dated evidence; do not turn tentative ideas into user decisions.

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
| P1 | Obtain period radio audio | First choice: one authentic Ottawa–Gatineau 2004 aircheck. Otherwise user-supplied music and ad/ident clips with dates/source/permission metadata. No authentic 2004 recording has been acquired in this session. |
| P1 | Build a programmed station beyond the cassette | Music → ident → music → ad/news, prevent repetition, independent station positions, resume/seek, level normalization, duck dialogue; preserve actual audio speed regardless of game-clock speed. |
| P1 | Audit real station identities/frequencies in summer 2004 | Current station copy mixes fictional and real labels. Do not advertise the existing synth dial as an authentic broadcast reconstruction. |
| P1 | Rebalance the calendar economy | Midnight-based progression removes old per-job farming limit. Preserve current driving; separately assess repeated-job rewards, the $1,200 target and 73-day pacing. |
| P1 | Historical weather fidelity | Current repository data is daily, not hourly: showers are represented as a daily rain state, not an exact rain timetable. Validate source provenance and add hourly observations before claiming hourly reconstruction. Add actual humidity/wind/temperature effects only when useful. |
| P1 | Moving-camera shadow/performance route | Fraser → Principale → marina, clear/wet/night. Measure long stalls, not only eligible sub-250-ms frame intervals. Check open meshes, thin poles, floating edges and shadow fade. |
| P2 | Improve trees and sky/cloud artwork | Keep period-appropriate geometry; compare silhouette and overdraw/shadow cost. |
| P2 | Streetlamp occlusion | Six point lights currently spill through walls; evaluate selective shadowing or cheaper occlusion. |
| P2 | Radio seek/metadata/loudness UX | Display filename/title, actual playback state, seek control, per-file loudness, missing-file handling and exportable private playlist. Current files persist by browser/origin, not in game save exports. |
| P2 | Night-only mission semantics | Clock now stays continuous, so any narrative requiring night needs a wait/sleep mechanic or eligibility rule rather than a hidden time jump. |
| P2 | Summer end / free-roam date policy | Campaign completes after Sept 6; post-ending free roam keeps the last supported date. Extending beyond summer needs more weather records and a deliberate calendar rule. |
| Deferred | New people, heavy post effects, real-time mirrors | User explicitly deferred people; bloom/motion blur remain off. |

## Helpful input, when convenient

1. Feedback on the new Glenwood proportions; no more Glenwood photos needed to continue. Earlier Principale originals would help its later façade pass.
2. Favourite stations, DJs and three to five songs that immediately say “Aylmer summer 2004”. A whole original recording is even better.
3. Reaction to the same corrected street in daytime and night: too glossy, too clean, too dark, too much texture, or wrong house proportions.
