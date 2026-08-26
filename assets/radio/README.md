# assets/radio — your own cassette

The game ships with no audio files: CKOI 102.1 is synthesised note by note in
`src/game/radio.js`. The second station on the deck is yours.

Drop audio files in this folder (`.mp3`, `.m4a`, `.ogg`, `.wav` — whatever your
browser plays) and write a `playlist.json` next to them. Press **R** while
driving to cycle **CKOI → Cassette → off**.

## playlist.json

Either a bare list of filenames:

```json
["01-semi-charmed-life.mp3", "02-la-plus-belle-des-marchandises.mp3"]
```

…or a list of objects, if you want the HUD line to read properly:

```json
{
  "tracks": [
    { "file": "01.mp3", "title": "Semi-Charmed Life", "artist": "Third Eye Blind" },
    { "file": "02.mp3", "title": "Dans la Peau",      "artist": "Noir Silence" }
  ]
}
```

| field | | |
|---|---|---|
| `file` | required | filename, relative to `assets/radio/` |
| `title` | optional | defaults to the filename without its extension |
| `artist` | optional | shown before the title on the HUD line |

Filenames are used as-is in a URL, so keep them simple — no `#`, no `?`.

## Notes

- Tracks play in order and wrap around; the deck keeps its place when you swap
  cars, and stops in the menu and on pause.
- Everything goes through the same Web Audio graph as the engine, so the tape
  ducks under the horn and under a hard pull, and the radio volume in the
  options screen moves it.
- Nothing in here is committed. This folder is in `.gitignore` apart from this
  README, so your mixtape stays yours.
