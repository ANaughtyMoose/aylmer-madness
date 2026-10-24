# AUD-02: the radio Tom asked for, and a mix with a ladder

Tom, 16 Oct 2026: the radio plays the wrong stations, the engine is too loud,
the police noise is annoying. Tom, 20 Oct 2026: the spliced Énergie 104,1 2004
mix "sounds right".

Branch `rf/aud-02`, cut from `fix/look-on-qr` at 7ed4dfb. Not merged, not pushed.
Red-team source: references/review/redteam-2026-10-19/audio.md (findings 1 to 9).

## What Tom does (2 minutes, after the merge)

1. Make this folder (it does not exist yet):
   `/Users/thomaslever/Desktop/Coding Projects/aylmer-madness-private/radio/stations/energie1041/verified/`
2. Copy his approved mix into it, under this name:
   `energie1041-2004-mix-v2.m4a`
   (from `/Users/thomaslever/Desktop/Coding Projects/aylmer-radio-work/out/energie1041-2004-mix-v2.m4a`; copy, keep the original).
3. Restart the server as usual (`node tools/serve.mjs 8141 --audio-dir "../aylmer-madness-private/radio"`).
   The line it prints ends in `, 1 station file)`.
4. Start a drive on http://localhost:8141: the radio is already on, on Énergie 104,1. R is power, Shift+R the next station.

Optional, in his own words: a `labels.json` beside the file,
`{ "energie1041-2004-mix-v2.m4a": { "title": "...", "date": "2004-07", "gainDb": -2 } }`.
`gainDb -2` would bring the mix (-16.1 LUFS) in line with the rest of the library
(about -18). No agent reads or writes that file.

## What changed

### 1. index.html plays the recorded library (finding 1)

* `src/game/radio-local.js` (new): `fetchLocalLibrary()`, loopback hosts only,
  one fetch of `/__local_radio/library.json` with a 1.5 s abort, `[]` on anything wrong.
* `src/main.js`: on index.html, a top-level await of that fetch before the deck
  is built. Rows -> `RecordedRadio` with those sources (plus pagehide persist and
  visibility hooks, which the prototype panel did for prototype.html). No rows
  (public build, `serve.mjs` without `--audio-dir`, a static host) -> the synth
  `Radio`, as before. prototype.html is unchanged (its panel still mounts the library).

### 2. The synth radio highpass bug (finding 2)

`_restart()` wrote each station's 900 to 1450 Hz `tone` into the 150 Hz car-speaker
highpass. Now each station's colour is a separate peaking node (`voice`) before the
speaker; `voicing(tone)` in radio.js: FM stations get the plain car speaker
(HP 150, LP 5 k, flat), CJRC 1150 AM (Q >= 2) gets an AM set (HP 300, LP 3.2 k,
+4 dB at 1450 Hz). Measured below: CHUM FM's loop through the chain is now -1.0 dB against the raw
loop (it was -10.3 dB with the 900 Hz highpass).

### 3. RADIO-2004-STATION stages 1 to 3

* radio-library.js: `energie1041` "Énergie 104,1" as the FIRST station, `realOnly`,
  `discover`, empty `recordingIds`. (The spec's `"call": "CKTF-FM"` field was left
  out: nothing reads it and tools/smoke_radio_fixes.mjs guards "no CKTF anywhere
  in the dial", which predates D33. The lead may decide to keep the field and
  change that guard.)
* serve.mjs: discovers `<audio-dir>/stations/<id>/verified/*.{mp3,m4a,ogg,wav}`
  for every `discover` station, realpath fence on that folder (a symlink out is
  dropped), sha256-of-name order, ids `energie1041-d1...`, optional Tom-written
  `labels.json` (title, date, gainDb only). library.json gets
  `{ id, url, recording }` with no file name, extension or path. Log: counts
  only (`15 private radio files, 1 station file`); a read error prints
  `station folder unreadable: energie1041`. Also `.m4a` is now served as
  `audio/mp4` (it was octet-stream; the approved mix is an m4a).
* local-radio.js forwards `recording`.
* recorded-radio.js: fresh default station `energie1041`; with no verified file it
  is not `available()` and the deck falls to CHEZ as before.
* Radio on at the start of a drive: `enterDrive` and the end of the opening call
  `radio.power(true)` unless the new setting `radioAuto` (Options > Audio,
  « Radio allumée au départ », default on) is off. Shift+R on a radio that is off
  now turns it on (main.js; the decks' own contract is unchanged).

### 4. The mix ladder (findings 3 to 8)

| Change | Where |
|---|---|
| No radio duck under engine load, either deck (horn and voice still duck) | radio.js `update`, recorded-radio.js `update` |
| Synth deck 0.85 -> 1.0 (`SYNTH_DECK`); synth deck ducks to 0.5 under a voice (it ignored `dialogue`) | radio.js |
| `volRadio` default 0.7 -> 0.9; a store from before (no `mix` field) holding exactly 0.7 moves to 0.9 once, any other value is kept | store.js |
| Master compressor -14 dB / knee 22 -> -10 / knee 12: acts from -16 dBFS, not -25, so a pull no longer pumps the radio | audio.js `makeMasterComp` |
| Engine -2 dB while speechSynthesis speaks (`audio.speech()`, written on change only) | audio.js, main.js |
| Speech at 0.45 x (about -7 dB): it plays outside the graph | fortier.js `SPEECH_GAIN` |
| Crash layers x2.5; a hit over 0.4 dips engine and radio to half (-6 dB) for 150 ms, back over about 0.3 s | audio.js `CRASH_*`, two new duck gains `engDuck`, `radioDuck` |
| Landings x1.6 | audio.js `LAND_GAIN` |
| Misfire cough 0.36 -> 0.14, at most one every 2 to 5 s, silent for 1.2 s after a crash (cars.js still skips the stroke; only the sound is spaced) | audio.js `misfire` |
| Cop horn: only a driving cruiser within 25 m closing faster than 2 m/s, then nothing for 5 to 11 s, 300 to 380 Hz, 0.25 to 0.45 s, level by the siren's 1/d law | cops.js `honkCue`, `HONK` |
| Ambience bed on index.html too (`audio.environment` was prototype-only), air bed 0.009 -> 0.016 | main.js, ambience.js |
| Auditions render crash and landing at the game's gains | core/audition.js |

AUD-01's engine trim (-4 dB) and siren law (`sirenLevel`, falloff, speech duck) are untouched.

## Levels before / after

`node tools/smoke_audio.mjs`, group "mix ladder (AUD-02)" (tools/mixladder.mjs):
the game's own renders in docs/audio through the chain constants the code
exports, with Web Audio's biquad formulas, dBFS RMS at the output (peak where
named). RMS stands in for LUFS; the engine is bass-heavy, so its LUFS reads about
1 to 5 dB lower than these RMS numbers (the red team measured cruise -31 LUFS,
WOT -25). The limiter's own action on the sum is not modelled. Recorded stations
are arithmetic from their programme loudness (-18 LUFS library, -16.1 LUFS mix).

| Source | Before (7ed4dfb) | After |
|---|---|---|
| Engine, 50 km/h cruise | -29.6 | -29.6 (AUD-01 trim kept) |
| Engine, 3000 rpm under load | -28.5 | -28.5 |
| Engine, loudest second wide open | -20.1 | -20.1 |
| Synth radio (CHUM FM), cruise | -45.0 | -30.6 |
| Synth radio (CHUM FM), wide open | -48.2 | -30.6 |
| Recorded station at -18 LUFS, cruise | -29.5 | -26.9 |
| Recorded station at -18 LUFS, wide open | -30.2 | -26.9 |
| Énergie 104,1 mix (-16.1 LUFS, gainDb 0), cruise | -27.6 | -25.0 |
| Crash, force 0.85, peak (pre-limiter) | -13.6 | -5.6 (limiter brings it to about -9) |
| Crash, force 0.85, RMS of 0.4 s | -26.9 | -18.9 |
| Engine under that crash | -28.5 | -34.5 for 150 ms |
| Landing 6 m/s, peak | -17.6 | -13.6 |
| Misfire, peak | -14.9 | -23.1 |
| Misfires heard per minute (damaged, on throttle) | 57 | 17 at most, none in the 1.2 s after a crash |
| Cop honks per minute, cruiser close | 23 (every 2.6 s, one pitch) | 7.5 on average, only while a cruiser closes in, 300 to 380 Hz |
| Master limiter starts acting at | -25 dBFS | -16 dBFS |
| Speech (text-to-speech, outside the graph) | x1.0 | x0.45 (-7 dB); engine -2 dB, siren -4 dB, synth radio x0.5, recorded radio x0.4 while it speaks |
| Ambience on index.html | none | air bed 0.016 (was 0.009, prototype only), water at the marina, birds |

Asserted in smoke_audio (AUD-02 checks): the synth loop within 3 dB of the raw loop;
no load duck on either deck; a recorded station at least 2 dB over the cruising
engine (+2.8) and inside -28..-24; the synth radio no more than 2 dB under it; the
crash the loudest thing and over -10 dBFS; engine -6 dB under a crash; misfire 12 dB
or more under the crash and at most 20 a minute; honks at most 12 a minute; limiter
from -18 dBFS or above; plus behaviour on the mock context (speech dip written
once, tap does not dip, a hit dips both, misfire waits after a crash and is spaced),
honkCue rules, voicing per band, the settings default and the one-time 0.7 -> 0.9 move.

## Checks

* `npm test` through qa-slot: **98/98 suites passed** (97 before plus the new
  tools/smoke_real_station.mjs). smoke_audio: 83 passed (73 + 10 ladder checks
  + the behaviour group). Two fixtures were adjusted to the new dial and settings,
  no check loosened: smoke_radio_fixes counts "the station the dial says" over
  stations that have a committed recording (Énergie has none, it is discovered);
  `mix` is a DEFAULT_SETTINGS key so smoke_ui and smoke_save keep "a stored
  settings object has exactly the known keys".
* tools/smoke_real_station.mjs (RADIO-2004-STATION A2 to A8): 17 passed. Fixture
  in os.tmpdir(): one generated silent WAV in `stations/energie1041/verified/`, one
  outside `verified/`, one symlink out. 1 Énergie row; library.json has no name,
  extension or path; d0, d2, `..` and `%2f` paths 403/404; log has counts only.
* m4a by hand: a generated silent m4a in a temp `stations/energie1041/verified/`
  is listed as `energie1041-d1` and served as `audio/mp4`; log `(0 private radio
  files, 1 station file)`.
* Boot gate (qa-slot, CMP_SRV_PORT 8258, CMP_CDP_PORT 9458; boot.mjs serves no
  audio dir, so index.html took the synth fallback): index.html ok, 0 console
  errors, moved 144.6 m; prototype.html ok, 0 console errors, moved 144.6 m.
* Harness `--plan full --only radio,cops,crash --port 8258 --cdp-port 9458 --rev
  a0f0f05 --audio-dir /private/tmp/aylmer-aud02-oS8M` (a temp folder holding one
  generated 120 s silent WAV in `stations/energie1041/verified/`), pack
  references/review/rf-aud-02/radio-cops-crash-a0f0f05: 2.7 min, worst beat mean
  59.3 fps, 0 console errors, 0 exceptions. index.html played the recorded deck:
  the radio column reads « Énergie 104,1 » in every crash (18/18) and cops (85/85)
  row, with nobody pressing R (radio on at drive start); « blocked » rows are the
  opening, where the deck is suspended by design. Cop honk on 4 of 44 siren
  seconds (9 %; the 16 Oct pack had 21 of 110, 19 %). Misfire 15 in 85 s of a
  damaged chase (about 11 a minute, was up to 2 a second). The crash second shows
  engDb -18.9 against -14.4 to -14.6 around it (the dip). No file name in
  transcript, audio.csv or console.log.

## Found on the way, not fixed (lead decides)

* tools/smoke_audio.mjs computes ROOT from a URL pathname, so in any checkout
  under "Coding Projects" (a space, `%20`) its whole audition group SKIPs. Fixing
  that shows one stale render: `saturn-cruise.wav: 67.9 Hz at 50 km/h in 3rd
  (want 83.1)`. Left as found; the AUD-02 ladder resolves its own path and runs.
  The renders (docs/audio) also predate AUD-01 and AUD-02's one-shot gains; a
  `node tools/audition.mjs` re-render needs headless Chrome.
* The "Cassette" slot on the synth dial is still a silent station (finding 9);
  not in this task's list.
