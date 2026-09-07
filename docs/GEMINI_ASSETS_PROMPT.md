# Aylmer Madness — asset scouting (Gemini 3.8 Flash, Antigravity)

Paste everything below the line into a new Antigravity agent on the `aylmer-madness` folder.

---

You are scouting **free, properly licensed 3D models, textures and sounds** for Aylmer Madness, a
from-scratch WebGL2 driving game set in Aylmer, Québec, summer 2004. A build-time converter
(`tools/gltf2mesh.mjs`, being written now by another agent) turns glTF into the engine's own
format, so what we need from you is not code: it is a **vetted shopping list with licences**,
and the files themselves where the licence allows, so nobody has to search again.

## Rules

- Do not modify any existing file; git is read-only. Everything goes under
  `gemini-inbox/assets/`. Downloads go under `gemini-inbox/assets/src/<source>/<pack>/` with the
  licence file beside them.
- **Licence is the first column, not the last.** CC0 preferred. CC-BY 4.0 acceptable (record the
  exact attribution line required). **Nothing else**: no CC-BY-NC, no CC-BY-SA, no "free for
  personal use", no Sketchfab "standard" licence, no ripped game assets, no trademarked liveries.
  If you cannot find the licence text on the page, do not list it.
- Sources to prefer: kenney.nl, quaternius.com, polyhaven.com, ambientcg.com, opengameart.org
  (filter CC0 / CC-BY), sketchfab.com (filter CC0 and CC-BY only, download the glTF), freesound.org
  (CC0 only), the Smithsonian 3D and NASA open collections where relevant. Say where each came from.
- Format: glTF 2.0 (.glb or .gltf + .bin) for models; PNG or JPG seamless tiles with a normal map
  where offered for textures; WAV or OGG for sounds. Record triangle count (open the file and
  count; do not trust the listing), dimensions, and whether the nose points +z / +y up.
- The game is stylised low-poly with real materials, not photoreal. Props ≤ 600 tris, vehicles
  ≤ 6 000, trees ≤ 600. Kenney and Quaternius are the right scale; a 200 k-tri Sketchfab car is
  useless, skip it.
- Period matters: 2004, Outaouais. A 2015 hydrant shape is wrong; a 1990s one is right.

## What to find, in priority order

**Vehicles (closest CC0 shape to each; exact model not required, silhouette is)**
1993 Ford Ranger regular-cab pickup · 1997 Saturn SL sedan · 1988 Honda Civic Si hatchback ·
1997 Pontiac Sunfire coupe · 1998 Subaru Forester wagon · 1999 Toyota Sienna minivan · 1991 Chevy
Cavalier Z24 · 1987 Oldsmobile Cutlass Ciera · 1988 Dodge Caravan · early-90s Ford F-250 ·
Orion I city bus · GM New Look "fishbowl" bus · Blue Bird school bus · a police cruiser (Crown
Victoria shape) · a beach cruiser bicycle · a 2004 mountain bike · a Sea-Doo on a trailer · a
14-ft aluminum fishing boat · an STO-style bus shelter.

**Trees and greenery of the Ottawa Valley**
sugar maple, silver maple, white elm, white pine, white cedar (tree and hedge), paper birch,
Colorado spruce, a lilac, a cedar hedge segment, cut lawn / long grass / cattail tufts, a big
old maple with a wide crown (Mike's yard).

**Street furniture, Québec 2004**
wood hydro pole with crossarm and transformer · cast-iron lamp post with a hanging basket ·
cobra-head street light · octagonal stop sign (blank face; we paint *ARRÊT*) · pedestal-mounted
traffic signal · Canada Post box · Bell payphone · yellow fire hydrant (Gatineau) · park bench ·
picnic table · garbage can · bike rack · hockey net · basketball hoop on a pole · a trampoline ·
a plastic Adirondack chair · a satellite dish · a window air-conditioner · a BBQ · a shed.

**Buildings (only if genuinely low-poly and modular)**
1970s bungalow / split-level kits, a strip-mall storefront kit, a gas-station canopy, a church
with a spire, a hockey arena shell, a marina dock kit.

**Textures (CC0, seamless, with normal maps where offered)** for these atlas cells:
`brick_brown brick_buff brick_red cedar clapboard_white clapboard_yellow shingle_brown
shingle_dark shingle_grey stone_beige stone_grey stucco vinyl_beige vinyl_blue vinyl_green
vinyl_grey vinyl_white`, plus asphalt (new and worn), concrete sidewalk, gravel, cut grass, sand,
limestone (Parliament), copper roof (weathered green), water (calm river albedo).

**Sounds (CC0 only)**: not engines (the game synthesises those) — ambience: cicadas, crickets,
a marina's halyards, river lapping, wind in maples, a distant lawnmower, a screen door, a hockey
puck on pavement, a skateboard, gravel under tyres, an air-brake sigh, a school-bus stop-arm,
a payphone coin drop, a Sea-Doo, a Canada goose, gulls, a thunderstorm rolling in, rain on a
truck roof, a cassette deck eject.

## Deliverables

- `gemini-inbox/assets/CATALOGUE.md`: one table per section above. Columns: need · file ·
  source URL · pack · author · **licence** · attribution line (if CC-BY) · tris · dimensions ·
  axes · fit (1–5, how close to the 2004 Aylmer thing) · notes. Sorted by fit.
- `gemini-inbox/assets/catalogue.json`: the same, machine-readable, so the converter can be
  pointed at it.
- The downloads, with licence files, under `gemini-inbox/assets/src/`.
- `gemini-inbox/assets/GAPS.md`: what you could not find under a usable licence, so it goes to
  image generation or hand-building instead.
- `gemini-inbox/assets/STATUS.md` when done or out of budget.

Be strict about licences and honest about fit. A perfect model under the wrong licence is worth
nothing to this project; a rough CC0 one is worth a lot.
