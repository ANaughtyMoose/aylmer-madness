# AUD-01: engine down, siren less annoying

Tom, 16 Oct 2026, after playing fix/look-on-qr at 6fd2a64: "Engine noise is a
bit too much relative to other noises and police noise is pretty annoying."

Branch `rf/aud-01`, cut from `fix/look-on-qr` at 6fd2a64. Not merged, not pushed.

## Before: the mix as found (src/core/audio.js at 6fd2a64)

All values are linear gains; dB is 20 log10 of the gain.

| Part | Where | Gain | dB |
|---|---|---|---|
| Master | `master` (0.5 x vol.master) then compressor -14 dB / 5:1 | 0.50 | -6.0 |
| Engine bus | `engBus` = vol.engine (slider) | 1.00 | 0.0 |
| Engine voice | `n.out` = p.gain x shape x 0.40 | see below | |
| Engine at idle (800 rpm, no load) | shape 1.10 | 0.44 | -7.1 |
| Engine at cruise (2400 rpm, load 0.4) | shape 0.77 | 0.31 | -10.2 |
| Engine at redline, full load | shape 1.08 | 0.43 | -7.3 |
| Effects bus | `fx` = vol.effects | 1.00 | 0.0 |
| Siren | one voice, `fx`, constant whatever the distance | 0.12 | -18.4 |
| Radio bus | `radioBus` = vol.radio, cabin lowpass | 1.00 | 0.0 |
| Radio deck | 0.85 x signal, ducked to 0.58 under engine load, 0.28 under the horn | 0.85 | -1.4 |
| Ambience bus | vol.ambience | 0.65 | -3.7 |
| Your horn | two saws | 0.09 | -20.9 |
| Other horns / cop horn | `honk()` | 0.07 / 0.05 | -23.1 / -26.0 |
| Blip / chime (warnings, star and job cues) | `blip()` | 0.18 / 0.16 | -14.9 / -15.9 |
| Wind / roar above 70 km/h | `wind()` | 0.06 / 0.05 | -24.4 / -26.0 |
| Heckle yelp (« Heille! ») | `heille()` envelope peak, through two narrow formant bands | 0.90 | -0.9 (pre-filter) |

Heckles in `game/heckle.js` are on-screen text; the only audible heckle is the
pedestrian yelp `heille()`. Radio speech: the radio's DJ breaks are on-screen
text; the spoken lines are `speechSynthesis` (game/fortier.js), which main.js
already reports to `radio.update` as its fourth argument.

Siren as found: one square oscillator at 660 Hz, a square LFO at 1.6 Hz moving
it +/-150 Hz (510 / 810 Hz hi-lo), a lowpass at 1500 Hz with the default Q of 1
(a small resonant bump at the cutoff). Constant 0.12 into the effects bus from
the moment any cruiser is dispatched, at any distance (a cruiser spawned 110 m
away is as loud as one on your bumper). There is only ever one siren voice,
however many cruisers there are (MAX_UNITS = 2). It is not ducked under
anything.

Engine as found: there is no engine trim apart from the player's slider
(`engBus`); the voice's own master is the 0.40 in `set()`.

## After: what changed

| Part | Before | After | Change |
|---|---|---|---|
| Engine bus | vol.engine | vol.engine x ENGINE_TRIM (0.631) | -4.0 dB at every rpm and load |
| Engine voice shape (idle / cruise / redline) | 0.44 / 0.31 / 0.43 | unchanged | 0 dB, so idle and redline keep their character |
| Siren, within 20 m | 0.12 | 0.06 (SIREN_NEAR) | -6.0 dB |
| Siren, 40 / 80 m | 0.12 | 0.030 / 0.015 (near x 20/d) | -12.0 / -18.1 dB vs before; -6 / -12 dB vs near |
| Siren, beyond 125 m | 0.12 | 0.0096 (floor, 0.16 x near) | -21.9 dB vs before; never silent while a cruiser is out |
| Siren while speech plays | not ducked | x 0.631 | -4 dB while `speechSynthesis` is speaking |
| Siren sound | square, hi-lo square switch 510/810 Hz at 1.6 Hz, lowpass 1500 Hz Q 1 | square, triangle wail 480 to 920 Hz at 0.28 Hz (3.6 s a sweep), lowpass 1700 Hz Q 0.5 | no pitch steps (no click per note); 3rd harmonic about 4 dB softer (-11 dB vs -7 dB) |
| Sirens heard at once | 1 voice | 1 voice, level from the nearest driving cruiser | at most 1 (the cap was 2) |

Everything else (radio, effects, horn, chimes, heckle yelp, ambience) is
unchanged, so against all of it the engine is 4 dB lower and the siren 6 dB
lower up close.

How it works:

* `src/core/audio.js`: `ENGINE_TRIM` on `engBus` (build, `_applyMix`,
  `setVolume`); the slider still runs 0..1 on top of it. `sirenLevel(d, talking)`
  is the level law. `sirenRange(d)` is called every frame by cops.js and writes
  the gain only when the target has moved by more than about 0.5 dB, so a steady
  chase writes nothing. No allocation per frame (a number, two compares, one
  `speechSynthesis.speaking` read). Callers that never give a distance
  (tools/aylmer-compare, tools/repair-review.html) get the near level.
* `src/game/cops.js`: tracks `nearestUnit` (driving cruisers only; the roadblock
  has no siren) in the loop it already runs, reusing one hypot per cruiser, and
  calls `sirenRange` before the once-a-second `siren(on)`.
* Gameplay cues are untouched: the warning line, the star heckle and the toasts
  are text, and the bust chime and the cop horn keep their levels. A cruiser at
  spawn range (110 to 120 m) sits at the floor: faint, but there.
* Radio content and the private radio folder are not touched.

## Checks

* `npm test`: 97/97 suites passed. tools/smoke_audio.mjs gains five AUD-01
  checks (engine trim -4.00 dB; siren -6 dB near; -12 dB at 80 m vs near; floor;
  -4 dB under speech) and calls `sirenRange` in its frozen-clock soak, which
  stays green (nothing queues while the clock is stopped).
* Boot gate through qa-slot with `CMP_SRV_PORT=8211 CMP_CDP_PORT=9411` (boot.mjs
  reads its ports from those variables, not from `--port`): index.html ok (menu,
  drive, 0 console errors, moved 144.6 m). prototype.html ok on a rerun, 0
  console errors, moved 144.6 m; the first try lost its CDP socket while
  `npm test` was loading the machine.
* Review harness `--plan quick --only cops` through qa-slot on ports 8212 / 9412.
  The audio log gained three columns (engDb, sirenDb, copM: the gain at the
  sample instant in dB, and the nearest cruiser in metres). Before = the tree at
  d0cfab4 (instrumented, audio unchanged); after = 6e768b1. Rows matched on the
  cruiser's distance (the bot drove the same chase in both):

| Cruiser | Before engine dB | After engine dB | Before siren dB | After siren dB |
|---|---|---|---|---|
| 119 m (pulling away, ~1600 to 1800 rpm) | -11.8 | -15.1 | -18.5 | -40.1 |
| 113 m | -12.0 | -16.2 | -18.4 | -39.8 |
| 102 m | -12.1 | -15.9 | -18.4 | -39.1 |
| 87 m | -11.2 | -14.7 | -18.4 | -37.9 |
| 68 m | -9.9 | -13.8 | -18.4 | -35.9 |
| 44 to 45 m | -9.1 | -12.8 | -18.4 | -32.6 |
| 22 to 23 m (~1900 to 2000 rpm) | -8.1 | -11.9 | -18.4 | -27.1 |
| 10 to 11 m (~2400 to 2600 rpm) | -7.7 | -11.6 | -18.4 | -24.5 |
| 16 to 18 m (~3000 rpm, load 0.92) | -7.4 | -11.3 | -18.4 | -24.4 |
| Idle, before the chase | -10.1 | -14.2 | off | off |

Engine: 3.5 to 4.2 dB lower at matching moments (single samples a second, so
about -4 dB). Siren: -6 dB with the cruiser close, -17 to -20 dB at 70 to 90 m,
about -21 dB at spawn range. A first after-run made under load (npm test and the
boot gate in parallel) had the bot sit still and get ticketed; it is not used.
