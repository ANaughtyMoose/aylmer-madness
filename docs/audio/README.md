# docs/audio — what the engines sound like

Nobody can hear a game through a diff, so `node tools/audition.mjs` renders the
synth in `src/core/audio.js` straight to WAV. These files are not recordings of
anything: they are the same graph the game builds, driven by the same
`game/gearbox.js`, running on an `OfflineAudioContext`.

| file | what it is |
|---|---|
| `<car>.wav` | 12 s — 2.6 s of idle, a wide-open pull through 1st/2nd/3rd, a plateau held at 3000 rpm, an overrun coast with pops, back to idle |
| `<car>-cruise.wav` | 8 s — a steady 50 km/h, where the box settles into third and the body starts to boom |
| `ranger-road.wav` | 16 s — everything the engine auditions leave out: pulling away on tarmac, the same 70 km/h on gravel and then on grass, a run to 130, an overrun coast, a kerb landing and an impact |
| `ranger-before.wav`, `ranger-cruise-before.wav` | the Ranger as it was before the 2.3-four pass: 750 rpm idle, no load timbre, no burble, no driveline thunk. Kept so the two can be played back to back |
| `radio-<style>.wav` | 8 s of CKOI 102.1, one per style (`src/game/radio.js`) |

All 16-bit mono at 22.05 kHz.

## What changed in the truck

The Ranger's 2.3 L four now idles at **800 rpm** (26.7 Hz of firing note, two
power strokes a revolution) and lopes there, and the graph grew four things that
were not in it before:

* a **load lowpass** swept between `toneLo` and `toneHi`, so an engine labouring
  up a hill is audibly a different noise from the same engine coasting past at
  the same revs;
* a graded **overrun** — a shut throttle kills the intake, closes the tone down,
  opens a low burble and speeds the pops up, instead of flipping a switch;
* a **driveline thunk** on the rising edge of the clutch, so a gearchange is
  something you hear rather than a hole in the noise;
* the **road voice** (`RoadDriver`): tyre roar and grit that follow the surface
  under the wheels, final-drive whine that tracks road speed and nothing else,
  and suspension thumps over anything rough.

`ranger-road.wav` is the one to listen to for the last of those. Measured off
the file, the gravel section carries about 2.3x the energy above 2.5 kHz that
the grass section does at the identical speed and throttle.

`audition.json` is what was measured off those exact files: peak, per-second
RMS, the dominant frequency at idle and at 3000 rpm, and where the gearbox
changed gear. `node tools/smoke_audio.mjs` re-measures the WAVs and asserts
against them — that a Ranger idles at 26.7 Hz (800 rpm ÷ 30), that every
four-cylinder reads 100 Hz at 3000 rpm, that nothing clips, and that the clutch
dips show up in the envelope where the gearbox says they should.

To regenerate:

```sh
python3 -m http.server 8133 --bind 127.0.0.1 &
"Google Chrome" --headless=new --remote-debugging-port=9222 --use-angle=swiftshader &
node tools/audition.mjs
node tools/smoke_audio.mjs
```

(`tools/audition.mjs` takes the base URL as its one argument, so
`node tools/audition.mjs http://127.0.0.1:8134` if 8133 is taken.)
