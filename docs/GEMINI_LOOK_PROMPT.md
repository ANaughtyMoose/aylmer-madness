# Aylmer Madness — the look-and-feel pass (Gemini 3.8 Flash, Antigravity)

Paste everything below the line into a new Antigravity agent opened on the
`aylmer-madness` folder.

---

You already reviewed **Aylmer Madness** (your work is in `gemini-inbox/`; read
`gemini-inbox/INDEX.md`, `REVIEW.md` section A6 and `PLAYTEST-GEMINI.md` to
remember what you saw). Now you are going to make it **beautiful**. Right now
every surface is one flat colour and every house is a coloured box with a roof.
The goal of this pass is that 299 chemin Fraser looks like 299 chemin Fraser,
rue Principale looks like rue Principale, and the whole town looks like a
place at golden hour instead of a tech demo. This is a beautiful, fun,
engaging game or it is nothing.

You have a terminal, a browser you can drive and screenshot, Python, image
generation, and the whole repo. The last time you pulled the 2009 Street View
panoramas with the `streetlevel` library you **described them and threw the
pixels away**. This time the pixels are the deliverable.

## Rules

- **Do not modify any existing file.** Nothing in `src/`, `tools/`, `docs/`,
  `assets/`, `index.html`, `style.css`. Git is read-only: no checkout, switch,
  stash, commit, add, push, reset, clean. Record `git branch --show-current &&
  git rev-parse --short HEAD` at the top of your report.
- **Everything goes under `gemini-inbox/look/`.** New files only. You *may*
  create new HTML/JS/Python files there that `import` modules from `src/`
  to prove your assets render (see "The lab page" below). Importing is fine;
  editing is not.
- Serve on port **8151**: `python3 -m http.server 8151 --bind 127.0.0.1`.
  One browser at a time. Check `uptime`; above load 8 nothing you measure
  counts.
- **Google Street View pixels do not ship.** The raw crops are reference. Save
  them under `gemini-inbox/look/streetview/` (that folder will be gitignored,
  not committed to the public repo). Everything that goes into the game is a
  **generated or hand-cleaned derivative**: rectified, de-blurred, with cars,
  bins, people and modern changes removed, and colours corrected to 2004.
- No people, no faces, no licence plates in anything you produce. The cast are
  real people; **do not generate their likenesses**. Avatars are not part of
  this pass.
- Setting is summer 2004. Where 2009 imagery and today disagree, build 2009.
  Where `changedSince` in `assets/text/streetview.json` and
  `assets/text/streetview_pack.json` says what to undo, undo it.

## Read first

- `assets/text/streetview.json` and `assets/text/streetview_pack.json`: your
  own 2009 descriptions and the 2004 corrections (Sayyad's house was olive
  clapboard with burgundy posts and green X-brace railings; Mike's dormer was
  brown wood shakes; the big evergreen at 1 Arial was still standing; the trees
  at 299 Fraser were much smaller).
- `docs/NEXT.md` sections 6–9 and `docs/HOUSES.md`, `docs/HOUSES-REPORT.md`:
  the house archetypes and how footprints become buildings.
- `src/core/gl.js`: one shader. Read the top 140 lines. The texture
  **multiplies** the vertex colour; a white texel leaves the vertex colour
  alone. `renderer.texture(image)` uploads any canvas or image; a mesh with
  `mb.textured = true` and UVs drawn with `opts.tex` samples it. That is how
  the 120 storefront signs and the landmark boards already work
  (`src/game/signage.js`, `src/game/landmarks.js` around `buildSignMesh`).
  **This is the path your facade images will take.**
- `tools/make_atlas.py` and `assets/materials/atlas.json`: the house material
  atlas. 2048², 18 tileable cells of 320 px core with an 8 px wrapped bleed,
  and 8 decal cells of 496 px core. Cell names, which your tiles must match
  exactly: `brick_brown brick_buff brick_red cedar clapboard_white
  clapboard_yellow shingle_brown shingle_dark shingle_grey stone_beige
  stone_grey stucco vinyl_beige vinyl_blue vinyl_green vinyl_grey vinyl_white`
  (tiles), `door_white door_wood garage_door_1 garage_door_2 porch_rail
  window_2pane window_bay window_small` (decals), and `flat` (pure white,
  leave it).
- `src/game/houses.js` (how a footprint picks wall/roof tiles per archetype),
  `src/game/landmarks.js` and `src/game/ottawa_landmarks.js` (the hero
  buildings, all hand-built geometry with flat colours), `src/game/sky.js`,
  `src/game/weather.js`, `src/game/props.js`, `src/game/streetprops.js`
  (trees, poles, signs — what is there now and how it is drawn).
- `data/houses.json` and `data/buildings.json`: real footprints with
  dimensions. Use them for facade widths; do not guess.

---

# PART 1 — Capture: pull the 2009 panoramas and keep them

Deliverable: `gemini-inbox/look/streetview/<slug>/` with the crops, and one
`gemini-inbox/look/streetview/index.json` listing, per crop: slug, panoid, pano
date, lat, lng, heading, pitch, fov, file, and what is in frame.

Use `streetlevel` (or the equivalent) to fetch the **oldest** panorama at each
location and render perspective crops: for a house, front elevation as square-on
as the street allows, both three-quarter views, and a crop of the roof line;
for a street, a sequence of crops every ~15 m along it, both sides; for a
landmark, four sides where reachable. 1600 px wide or better. If the oldest
pano is not 2009, say what year it is.

Locations, in priority order:

**The cast's houses and the two garages**
299 chemin Fraser · 75 rue Denise-Friend · 129 avenue Frank-Robinson (corner of
rue Smiley; Lord Aylmer Junior Campus is across the street) · 1 rue Arial,
house and the detached garage at the end of the driveway · 841 boulevard
Wilfrid-Lavigne · rue Samuel-Edey around number 312 (the exact house is
uncertain; capture the block and mark it uncertain) · Garage Norm Lafleur &
Fils (find it; it is a real garage in Aylmer, on the game's map near
x 470, z −212 in `src/game/places.js`).

**Rue Principale, the whole village stretch**
Every storefront from the Auberge Symmes end to chemin d'Aylmer, both sides,
in order, as a numbered sequence. The 12 you already described are a start,
not the list. Include the British Hotel, Église Saint-Paul, the old Palais de
justice / Hôtel de ville, the Symmes Inn (1831, a museum, **not** the school),
the marina and Parc des Cèdres.

**Chemin d'Aylmer and the commercial strip**
Les Galeries d'Aylmer (the Zellers and Canadian Tire fronts, the cinema pylon),
the Petro-Canada, the used-car lot past the Canadian Tire, a Tim Hortons, a
dépanneur, an SAQ, a Rona, whatever else was there in 2009.

**The schools**
Philemon Wright High School · Symmes (the junior high, on chemin d'Aylmer —
Zahra's) · Heritage College (Cégep Heritage, rue Cité-des-Jeunes) · Club de
Golf Gatineau's clubhouse.

**Hull and Ottawa**
Place du Portage · the Alexandre-Taché causeway · the Champlain Bridge from
both ends and mid-span · the Chaudière and Portage bridges · Parliament Hill
(Centre Block and the Peace Tower from Wellington, the East and West Blocks) ·
the Château Laurier · the Rideau Canal locks and the National Arts Centre ·
Sparks Street · the Byward Market · Casino du Lac-Leamy · the Canadian Museum
of Civilization (its 2004 name).

**Chelsea and the 105** — a few crops of the road up the hill.

If a location has no Street View at all, say so in the index; do not
substitute a different building.

# PART 2 — Facades: what actually goes on the hero buildings

Deliverable: `gemini-inbox/look/facades/<slug>/<face>.png` and
`gemini-inbox/look/facades/facades.json`.

For each of the cast's houses, the two garages, the four schools/clubhouse,
Norm's, the Galeries fronts, the Petro-Canada, the Auberge Symmes, the British
Hotel, Église Saint-Paul, and the Ottawa landmarks: an **orthographic
elevation** of each visible face, generated from the Street View reference.
Requirements, all of them:

- **Albedo only.** Flat overcast light, no shadows, no sky reflected in glass,
  no lens vignette. The engine lights it; baked lighting will fight the sun.
- Rectified: verticals vertical, the ground line at the bottom edge, the eave
  or parapet at the top edge, the full width of the face edge to edge.
- Nothing in front of the wall: no cars, bins, trees, shrubs, people, poles,
  wires. Paint through them.
- **2004 colours and details**, per the `changedSince` notes: olive clapboard,
  burgundy posts and green railings at 75 Denise-Friend; brown shakes on
  Mike's dormer; the modern porch landing at 299 Fraser gone.
- Sized to the real face. `facades.json` gives, per face: `slug`, `face`
  (`front`/`left`/`right`/`back`), `widthM`, `heightM` (ground to eave),
  `file`, `pxPerM`, and `source` (which crop). Take the width from the
  footprint in `data/houses.json` / `data/buildings.json` and say which
  polygon. Aim for ~100 px per metre; cap at 2048 px on the long side.
- Roofs: a separate top-down roof texture per building where the roof is
  distinctive (Mike's shed dormer, the gambrel at 1 Arial, the Château's
  copper, Parliament's copper and dormers), `roof.png`, north up, sized to the
  footprint.
- For the Ottawa landmarks: Parliament's Centre Block front, the Peace Tower
  as a tall strip, the Château's Rideau Street face, the Museum's curves. These
  are large; one face at 2048 px is fine, and say what the real width is.

Where you are inventing (a back face nobody photographed), say so in the
manifest with `"invented": true`.

# PART 3 — Materials: real tiles for the atlas

Deliverable: `gemini-inbox/look/materials/<cellname>.png` for every cell name
listed above, plus new ones, and `gemini-inbox/look/materials/manifest.json`.

- Tileable cells at **640 px** (the atlas tool downsamples to 320 core; give
  it room). Decal cells at 992 px. Seamless on all four edges — test it by
  tiling 3×3 and looking. Albedo only, neutral brightness (the shader
  multiplies; a dark tile makes a dark house regardless of its vertex colour).
- Each from real Outaouais reference where possible: the red-brown brick of
  the 1970s Aylmer bungalows, the buff brick of the schools, the white vinyl
  siding that is on half the town, cedar-shake and asphalt-shingle roofs,
  cedar hedge, the stucco of the old village.
- **New cells** the town needs and the atlas lacks, with a proposed name:
  `clapboard_olive` (Sayyad's), `shake_brown` (Mike's dormer), `trim_burgundy`,
  `brick_red_old` (rue Principale), `limestone_parliament`, `sandstone_ottawa`,
  `copper_roof`, `concrete_portage`, `asphalt_road`, `asphalt_worn`,
  `sidewalk_brick_banded` (rue Principale), `gravel`, `grass_cut`, `grass_long`,
  `sand_beach`, `water_river` (a calm river albedo for the water shader to
  ripple), `bus_shelter_glass`.
- `manifest.json`: per tile `name`, `file`, `metresPerTile`, `kind`
  (`tile`/`decal`), `replaces` (existing cell or `null`), `source`.
- Then write `gemini-inbox/look/tools/make_atlas_from_images.py`: a **new**
  script that lays your tiles out in the **exact** `tools/make_atlas.py`
  layout (same cell order, same 336 px pitch, same 8 px wrapped bleed, same
  decal rows, `flat` white at 0,0) and writes `atlas.png` + `atlas.json` to
  `gemini-inbox/look/materials/out/`. Read `make_atlas.py` for the layout and
  the bleed logic and the hand-written PNG encoder; reuse the approach. The
  game must be able to take that output as a drop-in. Prove it: point the lab
  page at it.

# PART 4 — The world between the buildings

Deliverable: `gemini-inbox/look/env/`.

- **Trees**: alpha-cut billboard sprites, 1024 px tall, summer foliage, four
  views each or at least two (the engine can cross them), for the species that
  are actually there: sugar maple, silver maple, white elm, white pine, white
  cedar (as hedge and as tree), paper birch, a Colorado spruce (the one in
  every 1970s front yard), the huge maple in Mike's yard. Trunk to crown,
  albedo, no shadow on the ground. `trees.json` with real heights.
- **Sky and light**: read `src/game/sky.js` and `src/game/weather.js` to see
  what the sky is (a dome that mixes two colours plus a sun disc, and fog).
  Produce `sky.json`: for dawn, morning, noon, golden hour, dusk, blue hour,
  night, overcast, rain and post-rain, the `skyLo`, `skyHi`, sun colour, sun
  elevation and azimuth for **Aylmer at 45.4° N in late July**, ambient
  hemisphere colours, fog colour and density. Sample the colours from real
  Ottawa Valley summer photographs, not from memory, and cite them. Then a
  sun-disc sprite and three cloud sprite sheets (fair-weather cumulus, high
  cirrus, a storm front), alpha PNG.
- **Road furniture, Québec 2004**: sprite or decal PNGs, albedo, sized in
  metres in `signs.json`: the octagonal *ARRÊT* sign, *ARRÊT / STOP* bilingual
  where Aylmer had them, 50 and 30 km/h limits, *CÉDEZ*, a Québec green street
  name blade (rue / chemin / avenue), an STO bus stop sign as it looked in
  2004, a Petro-Canada pylon, a Tim Hortons sign, the Galeries pylon
  (*Cinéma / Billard / Terminus / SAQ*), a Zellers fascia, a Canadian Tire
  fascia, a dépanneur's Pepsi sign, a Bell payphone, a Canada Post box, a
  cast-iron rue Principale lamp post with a flower basket, an Hydro-Québec
  wood pole with transformer, a hockey net in a driveway, a Sea-Doo on a
  trailer.
- **Ground decals**: road markings as they were painted in Québec (yellow
  centre lines, white edge lines, *ARRÊT* stop bars, crosswalk ladders),
  manhole, storm drain, oil stain, tar snake, a crack, a puddle mask.

# PART 5 — Vehicles

Deliverable: `gemini-inbox/look/cars/<slug>/{side,top,front,rear}.png`.

Finish what B1 started. The spec is `assets/cars/README.md` and it is strict:
**four true orthographic elevations** on plain white, nose LEFT, no shadow,
2048 px wide, the four views at one consistent scale. The Ranger sheet you
made was a single atlas, not the four views; redo it to spec. All thirteen:
`ranger` (1993 Ford Ranger **XL** regular cab, white, black steel wheels, black
plastic mirrors and bumpers, whip antenna, no chrome) · `saturn` (1997 Saturn
SL 4-door, blue) · `civic` (1988 Civic Si hatch, red) · `sunfire` (1997
Sunfire coupe, teal) · `forester` (1998 Forester, green) · `sienna` (1999
Sienna, faded, one mismatched hubcap) · `cavalier` (1991 Cavalier Z24, red) ·
`cutlass` (1987 Cutlass Ciera, brown) · `caravan` (1988 Caravan, two-tone) ·
`f250` (early-90s F-250, two-tone) · `orion` (Orion I, STO livery) · `newlook`
(GM New Look fishbowl, STO 2004 livery) · `bluebird` (Blue Bird school bus).
Plus `cruiser` (a chrome beach cruiser bicycle) and `diamondback` (a 2004
Diamondback mountain bike), side view only.

Then one **dashboard** image per car for the hood camera, from the driver's
seat, 2048×768, albedo, the real 2004 dashboard of that model (the Ranger's
grey plastic and the tape deck; the Civic's red-lit cluster), no hands.

# PART 6 — UI and the feel of 2004

Deliverable: `gemini-inbox/look/ui/`.

- A **style guide** (`STYLE.md`): palette, type, HUD layout, minimap
  treatment, mission card, pause menu, the seam card, toast style, keyed to
  summer 2004 in the Outaouais (think what a Bell flip phone, an MSN window,
  a burned-CD sleeve and a Cowboys Fringants poster looked like, not a modern
  flat-UI kit). Show it, do not just describe it: mock every screen at
  1440×900 as PNGs, and include a French and an English version of the HUD.
- **Seam cards**, 1920×1080, painterly, no text baked in: Aylmer → Ottawa (the
  Peace Tower over the river from the Champlain Bridge, evening), Ottawa →
  Aylmer (the Gatineau hills from Parliament, sunset), Aylmer ↔ Hull (the
  Portage towers), up the 105 to Chelsea. Also a **title** key art: the white
  Ranger on chemin d'Aylmer at golden hour, and a variant for each playable
  character's car.
- **Mission cards**: one illustration per job in `gemini-inbox/story/
  campaign.v2.json` (or `assets/text/campaign.json`), 1280×720, in the same
  painterly style, no faces.
- **Radio station logos** for the stations in `src/game/radio.js`, 512²,
  period-correct type, as a 2004 station would have printed them on a bumper
  sticker.
- **Map**: a full-town paper-map style rendering of the road graph
  (`data/roads.json` and the Hull/Ottawa files) in the style of a 2004 Gatineau
  tourist map, for the Tab screen, 4096², plus a minimap texture treatment.

# PART 7 — The lab page: prove it renders

Deliverable: `gemini-inbox/look/lab.html` + `lab.js`, and screenshots in
`gemini-inbox/look/shots/`.

There are two lab pages already in `src/game/` (`houses_lab.html`,
`ottawa_lab.html`) that import the engine and render a single building on a
turntable. Read them and write your own, in `gemini-inbox/look/`, that imports
`../../src/core/gl.js` and whatever else it needs **without modifying anything**
and shows:

1. 299 Fraser, 75 Denise-Friend, 129 Frank-Robinson and 1 Arial with your
   facade textures mapped onto their real footprints, next to the current
   flat-colour version of the same house. Same camera, same light.
2. The current atlas beside your regenerated atlas on the same block of
   houses.
3. A street of your tree sprites, and your sky palette cycling through the day.
4. The Ranger built from your four views, on the turntable, beside the
   current Ranger.

Screenshot each at 1440×900 in your browser, look at them, and fix what looks
wrong before you write anything down. If a texture reads as a photo pasted on
a box, it is not done: the answer is usually that the light was baked in or
the tile was too dark for the multiply.

Then `gemini-inbox/look/INTEGRATION.md`: exactly how each asset class plugs
in, by file and function, for the agent that will wire it: where the facade
quads go in `houses.js` and `landmarks.js`, how the atlas swap works, where
the sky palette is read, where the tree sprites replace the current geometry,
how the dashboard image sits in the hood camera, how the seam card art loads
on `showSeamCard()`, and what each costs in memory (the four-point budget in
`docs/VERIFY.md` is 148 MB heap / 183 MB GPU at the driveway; say what your
assets add and what to compress). Be exact. Vague is useless here.

# PART 8 — Feel: tune it live, then write down the numbers

Deliverable: `gemini-inbox/look/FEEL.md`.

You cannot edit the physics, but every constant is reachable at runtime through
`window.AYLMER.G` in the console: the vehicle specs, the camera table (`CAMS`),
FOV, shake, the suspension. Drive the Ranger and the Civic for ten minutes
each, adjusting live, until the first ten seconds feel right — throttle
response, weight transfer in a corner, the handbrake, the sense of speed, the
camera settling after a bump, landing a jump. Record short browser clips
before and after. Then write down every constant you changed, the before and
after values, which file and line it lives in, and why. Compare to what
Midtown Madness 2, Burnout 3 and GTA San Andreas do with camera lag, FOV kick
and speed blur. Say which of your changes would be one line and which would
be a new term in the model.

---

# When you are done, or out of budget

`gemini-inbox/look/STATUS.md`: what is complete, partial, and not started;
the branch and commit; the load average during any measurement; the total
size on disk of what you produced per part; and the five images you are
proudest of, with the shot that proves each one renders. Update
`gemini-inbox/INDEX.md` with a `look/` section.

Be blunt with yourself. A facade that looks like a photograph glued to a box
is worse than the flat colour it replaces.
