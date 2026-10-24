# Aylmer Madness — sound and music implementation plan

Plan dated 27 September 2026. Implementation pass completed 28 September; read AUDIO-IMPLEMENTATION-REPORT.md for delivered behavior, test evidence and remaining listening/long-session validation.

## 1. Goal and confirmed direction

Make driving around Aylmer feel alive: a believable old truck, a readable sound mix, neighbourhood atmosphere, and real recorded radio. Preserve the early-2000s character and existing driving. The first delivery uses the recordings already acquired; acquiring more audio is not a prerequisite.

Confirmed controls: **R toggles radio power. Shift+R advances to the next station.** Each station loops its available recordings until more are added. Off is a power state, not a station. This supersedes the September 22 proposal for R/Shift+R next/previous and an Off slot.

Other standing constraints: normal-speed recordings independent of the accelerated game clock; private/local media; no contacting anyone; no further broad audio sourcing now. Keep real station identities and the supplied recording dates visible in library details. Preserve the existing missions pending Thomas's story revisions.

Recommended defaults below are implementation choices, not additional user decisions. No blocking questions remain for this plan.

## 2. What exists and what needs changing

Code inspected: `src/game/radio.js`, `src/core/audio.js`, `src/prototype/local-radio.js`, and radio/input/pause hooks in `src/main.js`.

- The current `Radio.toggle()` advances through the synthetic station dial and eventually powers off. `power(on)` already separates power. `next()` advances a track, not a station. These meanings must be made explicit before binding the new keys.
- Recorded imports currently become one cassette playlist. IndexedDB persists files in the current browser/origin. They are not individual station presets and are not included in ordinary game-save exports.
- The radio already connects to the Web Audio mix. Master, engine, effects and radio controls, cabin filtering, engine-load/horn ducking and pause hooks exist. Reuse these; do not add a second competing audio system.
- Engine profiles, road/surface sound, horn, skids, impacts, landing, misfire and several gameplay effects already exist. Improvements should start with listening and balancing, rather than assuming they all need replacement.
- Shift currently supports hold-to-look-back and an optional toggle mode. The requested chord needs deliberate input arbitration.
- Existing station saving mixes station IDs with legacy numeric state. New presets need stable IDs and a small versioned migration.

The September 22 inventory confirms 15 MP3 files and their probed durations. It does not establish complete playback, source authenticity, song lists or absence of modern inserted ads. No new listening or decoding audit was performed while writing this plan.

## 3. Station lineup and loop contents

The default dial contains five station presets in this order. CHEZ is the first selected station in a fresh profile. Preserve an existing user's saved power preference; otherwise begin off until an explicit play/radio action.

| Preset / stable ID | Existing recordings, in playback order | Approximate loop | Presentation |
|---|---|---:|---|
| CHEZ 106 / `chez106` | CHEZ 106.1 Ottawa — August 20, 2004 | 37:33 | Primary rock preset; play the complete recording, then repeat. |
| CBC Radio One / `cbc-radio-one` | WireTap S01E01 “It's Over”; WireTap S01E07 “Broken Telephone”; Mystery Project “The Dog It Was That Died”, Part 1 | 77:41 | English programme archive; sequential loop. Part 1 is incomplete as a story, so keep that label explicit. |
| Radio-Canada / `radio-canada` | Macadam tribus — Abla Farhoud, reportage Mohamed Lotfi | 11:23 | French programme archive; repeat the complete clip. |
| Oldies 1310 / `oldies1310` | CIWW Ottawa — August 19, 2004 | 43:26 | Complete supplied aircheck, then repeat. |
| Énergie Montréal / `ckmf943` | CKMF 94.3 Montréal 2004 aircheck | 31:45 | Explicitly a Montréal archive; never relabel it as CKTF Gatineau. |

These five loops contain approximately 3 hours 22 minutes of material in total, but the shortest individual station repeats after 11 minutes. Programme dates are taken from the existing inventory/report and remain provisional until source checks. Archival episodes are not a simulation of a particular day's live schedule. Do not invent local CBC frequencies or song titles.

Optional presets, available through the library settings rather than enabled on the initial dial:

| Optional preset | Contents | Loop / reason |
|---|---|---|
| Majic 100.3 / `majic100` | Ottawa's Majic 100.3 2003 | 2:13; useful sample, but repetition will be conspicuous. Enable only as a clearly labelled short archive loop. |
| Live 88.5 — later archive / `live885-later` | Six supplied files: 2007 Big Money Shot finale; November 9, 2023 bumper; official broadcast sample; Lonelytown spotlight; Ottawa Book Expo commercial; Paul Carriere/Château Vaugelas clip | About 10:23 combined. Mixed later/uncertain dates and promotional clips; not a continuous period music broadcast. Disabled by default. Preserve source labels and explicit “later archive” status. |
| Personal cassette / `personal-cassette` | Existing user-selected files | User order, whole playlist repeated. Show only when populated. |

Keep the standalone Bud Light spot (1:04) in the private library but outside the default loops. Existing broadcasts retain their own ads and idents. Do not insert extra ads into CBC, splice synthetic DJs over speech, or claim that the Bud Light clip aired on CHEZ. Any future custom ad sequence is a separate editorial feature.

## 4. Exact interaction contract

- R: on becomes off; off resumes the selected station at its saved position. It never advances stations.
- Shift+R: advance one enabled, playable station, wrap at the end, retain the current power state. If off, select silently; R then plays that choice. This is the recommended default for the otherwise unspecified off-state behavior.
- Treat the chord as one command. It must not also trigger R power, track skipping, key-repeat station cycling or a persistent look-back toggle. Accept either Shift key. Ignore gameplay shortcuts while typing, importing files or interacting with editable fields.
- Preserve Shift alone as look-back. In toggle mode, defer the standalone Shift toggle until release and cancel it if the radio chord consumed Shift. In hold mode, suppress look-back once the chord is recognized until Shift releases. A brief look-back before R is pressed can occur if Shift was already held; test its feel rather than adding a global input delay. Never leave a latched rear view after station switching.
- Show a compact two-second station label, e.g. “CHEZ 106 · 106.1 FM”, plus a brief off/on indication. Use programme/file information when known; do not fabricate the current song name.
- Pause-menu controls: power, next station, direct station selector, existing radio volume, and a library entry point. Any optional previous button is secondary and has no new keyboard binding. All controls call the same command path. Update help text and controller UI if an existing mapping is present; do not take over another driving button.
- Keep selection across vehicle swaps, reset/tow, missions and reloads. Retain the current game pause behavior: playback freezes while the game is paused and resumes only if power was on. Radio off must not mute the engine or other sound.

## 5. Playback, loops and persistence

Use an ordered playlist for each preset. Play each recording to its natural end, then advance; the last recording returns to the first. Do not shuffle, trim clock announcements, stretch audio to the calendar or randomize starting positions. At first use start at zero; subsequent visits resume. Unheard stations remain frozen for this first version. Continuous background station clocks are deferred.

Store `{version, power, selectedStationId, stations: {id: {recordingId, positionSeconds}}, volume}` using stable recording IDs. Keep station manifests separate from media files and browser object URLs. Save periodically at a modest interval, on power/tune/pause transitions and on page lifecycle events where possible. A sudden crash may lose the most recent interval; normal transitions should restore within roughly one second. Clamp seek positions after metadata loads, advance an ended recording correctly, and handle a removed/reordered track by stable ID.

Use a single active recorded-media playback owner connected to the existing radio bus. Long recordings should stream from stored blobs/media elements, not decode into full-length Web Audio buffers. Stop the outgoing source before starting the next; use a short fade-out/fade-in (initial tuning range 80–150 ms) to avoid clicks without overlapping two spoken programmes. Do not claim sample-perfect gapless MP3 looping. Audition boundaries and use tiny endpoint fades only where needed; preserve speech and the original files.

Protect every asynchronous load/play/seek with a current-request token so rapid switching cannot resurrect an old station. Attach handlers once, clean up nodes and URLs when replacing imports, and ensure `ended` events from stale sources cannot advance the selected station. Report playback rejection separately from user-requested off; allow one clear user action to resume when the browser requires it.

Missing or corrupt recording: skip once to the next valid recording and show useful feedback. All files missing on one preset: mark it unavailable and continue station navigation. All stations unavailable: remain silent with an import action, never an infinite retry loop or disguised synthetic substitute.

## 6. Library and private media workflow

Use the existing local picker and IndexedDB design, extended to station assignments. The source directory from the verified inventory is `/Users/thomaslever/.gemini/antigravity-ide/scratch/audio`. A browser cannot silently read that path: import through the local picker, or use a deliberately private local serving workflow if the implementation environment supports one. Keep one documented origin/port to avoid seemingly lost browser imports.

Create a manifest with station ID, display name, enabled flag, ordered recording IDs, filename/title, duration, language, reported date, source reference and verification status. Recordings may also carry a measured gain correction. Assign exact known filenames automatically; let the user review unmatched imports. Metadata can be versioned separately; private audio and personal source data stay out of public bundles/Git.

Migrate the old cassette store without deleting it. Preserve existing personal files and saved volume. If an old station ID is unavailable, select CHEZ if imported, otherwise the first valid preset, and report the fallback once. Provide clear per-station imported/missing status, replacement/removal, storage failure feedback and a metadata-only export. Explain that metadata exports and game saves do not contain audio. An import that cannot persist may still play for the current session.

Before implementation signoff, verify all files still exist, decode them end to end, inspect metadata/source notes, and audition beginnings, ends and representative breaks. Full decode is a technical check; it does not verify every spoken claim, date or advertisement. Report any content that remains unaudited.

## 7. Improve the radio/music mix

The recordings are the soundtrack for now. Prioritize period Canadian rock and the existing broadcast character; do not add an unrelated background score over the radio. Future expansion adds recordings to manifests without changing playback code. Record Canadian artists or song names only when actually identified.

1. Measure per-recording integrated loudness and peak levels, then audition speech, music and ads against the engine. Start with a radio calibration target near -18 LUFS and at least 1 dB true-peak headroom where feasible; these are working mix targets, not claims about the current files or a required broadcast standard.
2. Apply conservative per-file gain metadata through the existing radio path. Reduce gain when peak headroom demands it instead of aggressively compressing already-compressed archives. Keep originals untouched. The final master also needs headroom with radio, engine, horn and impact together.
3. Review the current engine-load ducking: acceleration should feel louder naturally without repeatedly making speech inaudible. Tune a subtle envelope, cap attenuation, and compare spoken CBC with music-heavy CHEZ. Brief horns should remain legible without sharp pumping.
4. If actual spoken mission dialogue exists, give it priority with a modest temporary radio reduction and smooth recovery. Text-only dialogue needs a readable mix, not an invented voiceover system. No voice cloning or new character voices in this pass.
5. Keep the car-speaker/cabin character subtle. Bypass synthetic station hiss, fictional DJs and signal-loss behavior for recorded archive presets in the first delivery unless an existing effect has been deliberately auditioned and retained. Do not add permanent static to already noisy recordings.
6. Offer a clear speech-friendly mix option if normal balancing cannot serve both talk radio and loud driving. Prefer a small number of understandable controls over an equalizer page.

## 8. Vehicle, world and feedback sound

Implement this after the core station playback works, in small independently reviewable passes.

| Area | Proposed improvement | Audible acceptance |
|---|---|---|
| Ranger/other vehicles | Audit idle, acceleration, coast, gear change, clutch, misfire and damage against existing profiles; smooth abrupt pitch/load transitions; tune low-frequency rumble and restrained mechanical rattle. | Acceleration reads clearly, idle is not exhausting, different vehicles are distinguishable, and switching vehicles leaves no old engine voice. |
| Tyres/road | Check asphalt, gravel, grass, wet road and skid transitions already supported; improve blends and intensity tied to speed/slip. | Surface changes are apparent without repetitive clicks or exaggerated squeal at ordinary turns. |
| Impacts/gameplay | Balance collision, landing, horn, repairs, towing and success/failure cues; debounce sustained contact and cap event bursts. | A scrape cannot machine-gun impact sounds; important cues remain clear without startling volume spikes. |
| Neighbourhood ambience | Add a restrained daytime outdoor bed and occasional distant activity where justified by existing map zones. | Fraser feels quiet; the town does not sound like a busy city everywhere. No constant birds inside the cabin. |
| Marina/waterfront | Add subtle water/wind and sparse distant activity with distance fades. | The waterfront gains identity without an abrupt loop boundary at a zone edge. |
| Weather/night | Reuse the game's weather/time state for modest rain, wind and sparse night ambience. Add only supported effects; do not pretend daily weather data gives exact hourly events. | Rain changes smoothly; night gets quieter; no fabricated thunder every few seconds. |
| UI/accessibility | Consistent low-volume confirmation/error cues; important events also have text/visual feedback; all mix settings persist. | Muting any sound category leaves the game understandable and playable. |

First inspect whether each ambient/effect source already exists. Reuse it or improve it before sourcing new assets. If a new sample is needed, prefer a small local/generated-procedural option consistent with the current project; document its origin. No downloads, purchases or outreach are necessary to complete the radio milestone. Add an ambience bus only if it materially improves user control; avoid duplicating existing sliders or applying volume twice.

Sound should respond to camera/cabin state without following arbitrary visual cuts. Bound simultaneous transient voices, reuse persistent nodes, disconnect finished sources, and avoid per-frame allocation. Environmental detail is secondary to frame stability and speech intelligibility.

## 9. Delivery sequence and evidence

### A — Baseline and media audit

Capture current test results and a short repeatable drive. Inventory the actual 15 files and assign stable IDs; decode, measure and audition as above. Record unknown content/date issues separately from broken media. Produce manifest and a source-to-preset table. No acquisition detour.

### B — Recorded station core and controls (first playable delivery)

Implement separate power/station commands, chord arbitration, five default presets, optional presets, playlist looping, position saving, migration and pause behavior. Connect library import and compact HUD/help. Demonstrate CHEZ → CBC → Radio-Canada → Oldies → CKMF → CHEZ, R off/on, and a reload restoring a mid-recording position. A station's end must loop even if the game date changes.

### C — Mix and reliability

Apply measured gain offsets, fade transitions, cabin/ducking tuning, missing-file recovery and cleanup. Stress rapid switching, pause/resume and vehicle swaps. Verify no second source plays and memory does not continually grow. This completes the radio/music milestone.

### D — Vehicle/world polish

Use the same route to improve the existing engine/effects, then add sparse location/weather ambience. Compare before/after at identical vehicle, speed, weather and volume settings. Keep each change only if it improves listening or gameplay clarity.

### E — Integrated audio signoff

Run the project smoke suite and targeted browser tests, listen to a sustained mixed-condition session, and save an evidence report with changed files, test commands/results, tested browser/device, listening observations and remaining gaps. Only then run the separate team-review prompt. Do not claim audio is implemented based on documents or test mocks alone.

## 10. Required checks

- Keyboard: R/Shift+R, both Shifts, hold/repeat, rapid chords, focused input, hold/toggle look-back, no power toggle from station switching.
- State: on/off and station selection, off-state station change, per-station resume, reload, vehicle swap, mission start/end, tow/reset, pause/map/menu, save migration, storage unavailable.
- Loops: all five presets wrap; CBC advances across three recordings then repeats; one-track loops work; optional later/short presets remain opt-in. Exercise boundaries by seeking near the end in-browser and include natural completion of at least a short file.
- Errors: missing/corrupt file, all-empty library, replaced recording, failed seek, autoplay rejection, stale asynchronous callback, hidden/restored tab, repeated import and URL cleanup.
- Mix: radio off, speech-heavy CBC, music-heavy CHEZ, acceleration, horn, crash, rain, cabin/external camera, all sliders at zero/default/high; check clipping and unexpected gain changes.
- Performance: repeat Fraser → Principale → marina in day/wet/night; record baseline and changed frame-time distributions including stalls, audio dropouts and memory over a sustained session. Isolate rendering cost from audio cost; no invented FPS claims or arbitrary hardware promises.
- Regression: run `npm test` and relevant existing audio/radio/browser checks after discovering their actual usage. Add focused tests for the new state transitions and failure handling; do not replace manual listening with assertions about gain variables.

Definition of done: requested controls work, imported stations loop and resume reliably, the mix is comfortable while driving, private files remain local, the evidence report is honest about what was heard/tested, and no known audio/input/save regression remains unresolved. Broader aesthetic extras can be explicitly deferred; station playback cannot.

## 11. Main trade-offs and deferred work

Frozen inactive stations make implementation reliable and let the listener finish a programme, but feel less like live radio. Repeated short clips become noticeable; more source audio is the eventual solution, not random interruption. Full airchecks preserve real presentation but have imperfect sound and unverified content; retain originals and label uncertainty. Local browser storage avoids distribution but needs import and can be cleared or differ by origin. Shift+R shares a modifier with look-back, so that interaction deserves real playtesting.

Defer live streams, simulated broadcast schedules, automatic DJ generation, separate song/ad scheduling, elaborate station wheels, additional media sourcing, a new musical score and character voice production. They do not block a good first version.
