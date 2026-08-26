# docs/audio — what the engines sound like

Nobody can hear a game through a diff, so `node tools/audition.mjs` renders the
synth in `src/core/audio.js` straight to WAV. These files are not recordings of
anything: they are the same graph the game builds, driven by the same
`game/gearbox.js`, running on an `OfflineAudioContext`.

| file | what it is |
|---|---|
| `<car>.wav` | 12 s — 2.6 s of idle, a wide-open pull through 1st/2nd/3rd, a plateau held at 3000 rpm, an overrun coast with pops, back to idle |
| `<car>-cruise.wav` | 8 s — a steady 50 km/h, where the box settles into third and the body starts to boom |
| `radio-<style>.wav` | 8 s of CKOI 102.1, one per style (`src/game/radio.js`) |

All 16-bit mono at 22.05 kHz.

`audition.json` is what was measured off those exact files: peak, per-second RMS,
the dominant frequency at idle and at 3000 rpm, and where the gearbox changed
gear. `node tools/smoke_audio.mjs` re-measures the WAVs and asserts against them —
that a Ranger idles at 25 Hz (750 rpm ÷ 30), that every four-cylinder reads
100 Hz at 3000 rpm, that nothing clips, and that the clutch dips show up in the
envelope where the gearbox says they should.

To regenerate:

```sh
python3 -m http.server 8133 --bind 127.0.0.1 &
"Google Chrome" --headless=new --remote-debugging-port=9222 --use-angle=swiftshader &
node tools/audition.mjs
node tools/smoke_audio.mjs
```
