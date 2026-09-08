# Aylmer Madness — the cinematic pass (Gemini, Antigravity)

Paste everything below the line into a new Antigravity agent opened on the
`aylmer-madness` folder. This is a follow-up to `docs/GEMINI_LOOK_PROMPT.md`;
its **Rules** and **Read first** sections apply here word for word (nothing in
`src/`, `tools/`, `docs/`, `assets/`, `index.html`, `style.css` is modified;
git is read-only; everything you make goes under `gemini-inbox/cinema/`; port
8151; no likenesses of the cast; summer 2004; Street View pixels do not ship).

---

Thomas's brief, verbatim: « I want it to feel beautiful and cinematic. Make it
feel like GTA a bit. »

Read `docs/HANDOFF.md`, `docs/NEXT.md` §4, and the newest branches touching
`src/game/story.js`, `src/game/coldopen.js` and `src/game/phone.js` if they
exist (`git log --all --oneline -- src/game/story.js`): the game is getting a
**cold open** (the father's lines as speech bubbles over a slow camera drift
around the Ranger in the driveway, control back within eight seconds), jobs
that arrive as **phone calls**, and a **« mission passed » beat** where the
money slides into the envelope. Your job is to make those moments, the seam
crossings and the title look like a film about one summer, and to hand the
engine agent numbers it can type in.

Three of the look pass's parts were never delivered and are the foundation of
this one. Do them first, to their original spec in `docs/GEMINI_LOOK_PROMPT.md`:

- **Part 5, vehicles** — the four orthographic views per car and the
  dashboard albedo per car (`gemini-inbox/look/cars/`). The prompts per car
  are ready in `assets/cars/GEMINI-PROMPTS.md`.
- **Part 6, UI and the feel of 2004** — `STYLE.md`, every screen mocked at
  1440×900, the seam cards, the title key art, the mission cards, the radio
  logos, the paper map (`gemini-inbox/look/ui/`).
- **Part 8, feel** — `FEEL.md`, the constants tuned live through
  `window.AYLMER.G` with before/after values and the file and line each lives
  in.

Then the new work:

# PART A — The cold open, shot by shot

Deliverable: `gemini-inbox/cinema/COLDOPEN.md` + `coldopen/*.png`.

A storyboard of the first twenty seconds, six to eight frames at 1920×1080 in
the painterly style of the seam cards, **no faces**: the Ranger in the driveway
at 299 Chemin Fraser at 7 h 40 on a June morning, the battery light, the keys
in the coin tray, the envelope on the seat, the street beyond the windshield.
For every frame: camera position and target in car-local metres (+Z forward,
+Y up, +X the driver's left — see `src/game/cockpit.js` line 18 for the
convention), field of view in radians, the move (dolly / orbit / hold) with
its duration and easing, and which line of the father's is on screen. The
engine's camera table is `CAMS` in `src/game/cockpit.js`; the drift must be
expressible as a list of `{t, pos, target, fov, ease}` keys, so write it as
JSON next to the board (`coldopen/keys.json`) and make it total ≤ 8 s.

# PART B — Colour, lens and light

Deliverable: `gemini-inbox/cinema/GRADE.md` + `grade/*.png`.

The engine has one shader (`src/core/gl.js`, top 140 lines) with a sun, a sky
term, fog, and vertex colours multiplied by the atlas; `src/game/sky.js` and
`src/game/weather.js` drive the palette, and `assets/text/palette2004.json`
carries the real sky per day. Give the engine agent:

- a **tone curve** (16 points, input → output, 0..1) and a **white point**
  for each of morning / noon / golden hour / dusk / night / overcast, plus a
  3-column matrix for the shadow tint and the highlight tint, so the whole
  frame reads like the same film stock. Show each applied to the four
  committed screenshots `docs/shots/cockpit-ranger-day.jpg`,
  `docs/shots/hud-english.jpg`, `docs/shots/follow-gone.jpg` and
  `docs/shots/wall-180.jpg`, before and after, side by side.
- **lens rules** as numbers: FOV at rest and at 100 km/h (the current kick is
  `fovAdd` in `CAMS`), vignette strength and radius, bloom threshold and
  radius, chromatic aberration if any (probably none: it is 2004, not a
  music video), and the speed-blur amount — and for each, one sentence on
  what GTA San Andreas, Midtown Madness 2 and Burnout 3 do.
- **light**: the sun direction per hour that matches Aylmer's latitude on
  the real dates (45.4° N; the calendar is `src/game/calendar.js`), shadow
  length and softness, and the fog colour and density that put the Gatineau
  hills in the right haze. Extend `gemini-inbox/look/atmosphere/lighting.json`
  rather than replacing it.

# PART C — The beats

Deliverable: `gemini-inbox/cinema/BEATS.md` + `beats/*.png`.

Mock, at 1440×900 in the game's real HUD proportions (`docs/shots/` has a
dozen frames of the current HUD; keep its positions):

- the **phone**: a 2004 Nokia/Bell-flip strip, bottom-right, incoming call
  from « Sayyad » with one line and the E prompt; the missed-call state; the
  French and the English (photocopy) version.
- the **mission passed** beat: the amount sliding into the envelope top-right,
  the day and days-to-Labour-Day ticking, one line from the giver, 1.5 s, over
  gameplay, no card.
- the **seam crossing**: the existing `#seam` card with your Part 6 art on it,
  the town name, and what the music does (say it in words and in a cue sheet:
  what fades, what comes in, over how many seconds).
- the **ending**: Labour Day, the envelope full or not, two frames.

For each beat a timing table: what appears at t = 0, 0.2, 0.5, 1.0, 1.5 s,
with easing. The engine agent will type these in.

# PART D — Sound

Deliverable: `gemini-inbox/cinema/SOUND.md`.

No files, a sheet: for the cold open, the phone, mission passed, the seam and
the ending — what plays, from where (the game's synth engine, the radio, a
CC0 sample you name with its licence from `gemini-inbox/assets/CATALOGUE.md`),
at what level, with what ducking. The radio stations are in
`src/game/radio.js`; the engine synth is `src/core/audio.js`.

# When you are done, or out of budget

`gemini-inbox/cinema/STATUS.md`: complete / partial / not started for Parts
5, 6, 8, A, B, C, D; the branch and commit; load average during anything you
measured; and an **INTEGRATION** section that says, file and function by file
and function, where each number goes. Vague is useless here; a number the
engine agent can paste is the whole deliverable.
