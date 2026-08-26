# Making the houses look like Aylmer houses (W1)

Recovered from the original assessment (session of 2026-08-25). Not started.

Short version: don't pull Street View pixels into the game — Google's Maps
Platform terms forbid storing or repurposing Street View imagery (and
Photorealistic 3D Tiles) outside their products, so a scraper-to-textures
pipeline would be both a ToS breach and brittle. What actually makes Aylmer
houses look like Aylmer houses is mostly *data you can get legally*; Street
View's proper role is human reference plus a validation tool.

## What looks wrong today

Every house is the same extruded footprint with a random pastel and a gable
along its longest edge. Real Aylmer reads as **era + neighbourhood**:

- Vieux-Aylmer: 1880–1920 brick and clapboard two-storeys with front porches
- Wychwood / Lakeview: 1950s–60s brick-veneer bungalows, hipped roofs, carports
- Deschênes: cottages
- Lucerne / Champlain: 1970s–90s split-levels and brick-base/vinyl-top
  colonials with attached garages
- North subdivisions: 2000s stone-front, two-car-garage

Nail those five archetypes and it feels right from the driver's seat.

## Phase 1 — Free, legal per-house attributes (the big win, ~1 day)

1. **Gatineau open data: the rôle d'évaluation foncière** (assessment roll).
   Per address: year built, storeys, construction type (plain-pied / à étages /
   split-level), physical link (detached / semi / row), dwelling count. We
   already have an address per footprint from OSM (`addr:*` in
   `data/buildings.json`, sourced from Gatineau's own open data), so it joins
   directly. This decides the archetype for ~90 % of houses.
2. **Québec open LiDAR (MRNF DSM/DTM)** covers the Outaouais. Sampling the
   surface model over each footprint gives real height, roof form (hip vs
   gable), ridge orientation, and garage wings / porches as height steps.
   Replaces "gable along the longest edge" with the actual roof.
3. Footprint shape analysis: L-shapes → attached garage wing on the short leg;
   long thin → row/semi; setback from the road → front-yard depth and driveway
   length.

Output: a `data/houses.json` (per OSM building id: era, storeys, link, roof,
ridgeYaw, height, garage) consumed by `tools/build_map.py`.

## Phase 2 — Archetype system in the engine (2–3 days, the bulk)

Replace extrude-and-cap in `world.js` with ~14 parametric house builders keyed
by (era, storeys, link, roof form): porch with posts, dormers, chimney, bay
window, attached/detached garage with a driveway to the real street, front
steps, hip/gable/mansard roofs, split-level offsets. Each archetype has a
material recipe: base course (brick red/brown/buff, stone) + upper (vinyl
white/beige/grey/blue, clapboard, stucco) + shingle colour. Assignment is
deterministic from Phase 1 data with a seeded jitter so neighbours differ.

## Phase 3 — Real materials, not vertex colours (~1 day)

The engine already has UV/texture support (car skins). Build one 2048²
material atlas: tileable brick, vinyl siding, clapboard, stone veneer, asphalt
shingle, plus window and door decals. Generate tiles with Gemini ("seamless
tileable texture, 512×512, flat lighting…") or procedurally. Walls get tiled
UVs per storey; windows placed by storey count and wall length. Biggest visual
jump per hour.

## Phase 4 — Imagery as ground truth (legally, optional)

- **Mapillary** (CC BY-SA, API permits download) — check Aylmer coverage.
- **Your own drive**: a 30-minute loop with a phone on the dash (Principale,
  Front, Fraser, Lucerne, Wilfrid-Lavigne, Denise-Friend, Deschênes) gives
  ~2,000 geotagged frames you fully own.
- Run each frame through Gemini vision with a fixed schema (siding material,
  colour, storeys, roof form, garage, porch, brick base) → JSON keyed by nearest
  address. Feeds Phase 2 as overrides where the roll is ambiguous.
- Street View: use it the way an artist would — look at each neighbourhood
  while designing the archetypes and palettes. Human reference is fine;
  automated capture isn't.

## Phase 5 — Hero buildings (a weekend with photos)

Ten landmarks hand-modelled with photo-textured facades from your own photos:
Galeries d'Aylmer, Auberge Symmes, the British Hotel and the Principale
storefront row, Église St-Paul, Aréna Frank-Robinson, the Tim on Principale,
Hôtel Deschênes, and the friends' houses (299 Fraser, 75 Denise-Friend,
27 Bancroft, 20 Vanier, 129 Frank-Robinson) — they'll be checked.

## Validation loop

A "photo match" mode in the game: type an address and a heading, the camera
snaps to the curb at Street View height, compare against a Street View
screenshot side by side. Iterate archetypes until the friends' streets pass the
"yeah, that's my street" test.

## Order

Phase 1 → Phase 3 → Phase 2 → Phase 5 → Phase 4. Phases 1 + 3 alone get most
of the way.
