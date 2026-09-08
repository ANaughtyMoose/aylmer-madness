# Aylmer Madness — the redo pass (Gemini, Antigravity)

Paste everything below the line into a new Antigravity agent opened on the
`aylmer-madness` folder. The **Rules** of `docs/GEMINI_LOOK_PROMPT.md` apply
(nothing outside `gemini-inbox/` is modified; git read-only; port 8151; summer
2004). Everything new goes under `gemini-inbox/redo/`.

---

Thomas looked at the cinematic pass. The seven cold-open frames in
`gemini-inbox/cinema/coldopen/` are exactly right: that is the standard for
everything below. Three deliverables were built by writing Python to cut and
paste images together, and they are being thrown away: the title key art, the
HUD beat mock-ups, and the Ranger orthographic sheet. Redo them as **generated
images**, one image per file, to the specs below. Two rules that are not
optional:

- **No script compositing.** No cut-outs, no pasted photos, no posterize or
  edge filters, no text rendered by PIL, no labels baked into images. If you
  cannot generate it as one image, say so and stop — do not composite.
- **The truck's canon is fixed** and lives in `src/game/cars.js` (« XL — the
  BASE trim »): a 1993 Ford Ranger XL regular cab, short bed, **one colour of
  white** (`#ebe8dd`) over the whole body, no two-tone band, no stripes, black
  plastic bumpers, black paddle mirrors, black door handles, argent steel
  wheels with small hub caps, the badge low on the bed side, a whip antenna.
  **Nothing on this truck is chrome and it is never green.** Light surface
  rust along the cowl seam and the wheel arches is correct.

# 1 — Title key art

Deliverable: `gemini-inbox/redo/title/title_key_art.png` (1920×1080) and
`title_key_art_portrait.png` (1080×1920), plus two variants of each.

The white Ranger on chemin d'Aylmer at golden hour, the Ottawa River and the
Gatineau hills behind, in the painterly-photoreal style of
`cinema/coldopen/shot1_driveway.png`. A seventeen-year-old in a white polo
leans on the front fender holding a pulled-out Ford factory cassette head unit
with its wire harness and orange wire nuts hanging down; an acoustic guitar
rests against the front tyre. Use `gemini-inbox/look/ui/tom_photo_2004.jpg`
only as a reference for hair colour (strawberry blond), build and clothing —
**paint the figure, do not cut the photograph out**; the face may be turned
three-quarter away or in shadow. No text in the image: the title is typeset by
the game. The plate on the bumper reads a plausible 2004 Québec plate that is
NOT Thomas's real one — use `AYL 2004`.

Variants: (a) the same scene with Sayyad's red 1988 Civic Si beside the Ranger,
(b) blue hour with the headlights on.

# 2 — The Ranger's four views, to spec

Deliverable: `gemini-inbox/redo/cars/ranger/{side,top,front,rear}.png`.

Read `assets/cars/README.md` first; it is strict. Each file is **one image of
one vehicle**: a true orthographic elevation (not 3/4), pure white background,
no ground plane, no shadow, no labels, no text, no second view, no spare
parts. Side and top: 2048×1024, **nose pointing LEFT**, the truck filling ~90 %
of the width. Front and rear: 1024×1024. Consistent scale across the four.
Flat, even light; dark tinted glass. The truck as described in the canon
above — white, black bumpers, steel wheels. The plate is blank white.

Run `node tools/car_views.mjs` against your four files (copy them to a scratch
folder that mirrors `assets/cars/ranger/` under `gemini-inbox/redo/`, do not
write into `assets/`) and include its output in `redo/cars/REPORT.md`; if it
measures the truck wrong (the HANDOFF notes it once « measured wide »), say
what the silhouette did.

Then, only if the Ranger passes: the same four views for `civic` (1988 Civic
Si hatch, red), `saturn` (1997 Saturn SL 4-door, blue) and `sunfire` (1997
Sunfire coupe, teal), the three cars the loader already has folders for.

# 3 — Beat assets, not beat mock-ups

Deliverable: `gemini-inbox/redo/beats/`.

The HUD is drawn by the engine; do not mock it. Produce the pieces the engine
will draw:

- `phone_strip.png` — a 2004 Bell Mobility Nokia-style handset face, front
  view, 512×160, transparent background, screen area left blank (the engine
  writes the caller and the line); and `phone_strip_lit.png`, the same with the
  backlight on.
- `envelope.png` — a manila envelope with a Caisse populaire Desjardins deposit
  slip corner showing, 256×160, transparent background, for the mission-passed
  slide.
- Seam cards, 1920×1080, painterly, **no text**: Aylmer → Hull (the Portage
  towers across the river), Hull → Aylmer (the Deschênes rapids and the
  Aylmer shoreline), up the 105 to Chelsea (the Gatineau hills, the river
  below). The two Ottawa ones already exist in `look/ui/`.
- Mission cards, 1280×720, painterly, no text, no faces: one per job in
  `src/game/missions.js` `OPENING_ORDER` (read the titles and briefs; the
  first is « L'alternateur » — the Canadian Tire on chemin d'Aylmer, a parts
  counter, a box on the bench seat).

# 4 — Corrections to the last pass (facts, not art)

Deliverable: `gemini-inbox/redo/CORRECTIONS.md`.

- **Radio.** The stations that exist are the `name` fields of the station
  table in `src/game/radio.js` (CKOI 102.1, CIMF 94.9, CHEZ 106.1 and whatever
  else that file lists) — nothing else. The seven bumper stickers in
  `look/ui/radio/` name stations the game does not have (MAX 105.3, CHLL,
  CJRC, CKUQ, CFRL, CKOT) and a wrong frequency for CKOI. Regenerate one
  sticker per real station, 512², period type, as an image, and delete
  nothing (Thomas decides what goes).
- **Sun.** For `cinema/grade/sun_angles.json`, show the check: NOAA's solar
  position for 45.40° N, 75.85° W on 2004-06-26 at 07:40 EDT, 12:00, 19:30,
  and 2004-09-06 07:40, next to your numbers, with the difference. Fix yours
  if they differ by more than one degree.
- **FEEL.md.** For each of the fourteen constants, say which file and line
  it is on TODAY (`git log` shows the camera code moved on 2026-09-07; the
  driver cam's pitch and fovAdd in `src/game/cockpit.js` were set by looking
  at the hood and must not be changed by a table paste) and whether the
  change is a one-liner or a new term.
- **MARINA.md.** Cross-check your `buildMarina` footprint against
  `data/buildings.json` (the real pavilion polygon) and the water mask in
  `src/game/mapdata.js` (`waterMask`): the jetty must be over water and the
  pavilion on land. Report the coordinates you used and what the data says.

# When you are done

`gemini-inbox/redo/STATUS.md`: complete / partial / not started for 1–4, the
branch and commit, and for every image the exact prompt you used, so a redo
of a redo is one line.
