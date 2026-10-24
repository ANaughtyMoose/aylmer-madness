# Visual plan: making Aylmer 2004 look less blocky

29 September 2026. Branch `qr/visual`. Scope: the prototype renderer (`prototype.html`, `src/prototype/*`) plus the house and landmark builders that feed both renderers.

Tom asked for this: "It looks so blocky and unrealistic. I'd love if it looked a lot better (also if the houses looked way better - some of them are just slapped on textures across the whole thing). Just look at what great games do right, especially GTA IV."

The standing backlog decision still applies. The target is the early-2000s PC look of Midtown Madness 2, with no modern gloss. GTA IV is used below for its **atmosphere and density**, not its post-processing. This plan takes GTA IV's grading, haze, lit windows and grounded buildings. It does not take its bloom, depth of field or motion blur.

Screenshots are in `docs/design/shots/`, named `<place>-<hour>-before.jpg` and `<place>-<hour>-after.jpg`. The places are home (299 Chemin Fraser), glenwood (Rue Glenwood), principale (the Principale / Frank-Robinson corner) and marina. The hours are 13 (noon), 205 (20:30, dusk) and 23 (night). There is also `longsault-16-*` (Rue du Long-Sault at 16:00). All were taken with a 1280×800 headless Chrome on the M4 GPU, weather clear, HUD hidden.

---

## 1. What was wrong (before shots)

| # | Problem | Where it shows |
|---|---|---|
| W1 | **Blank textured boxes.** One house in five had a LiDAR ridge fitted more than 12° off its own walls. Built in that frame, the footprint broke into small rotated rectangles *inside* the walls. Every window face then tested as an internal seam, so the house came out as brick or siding from lawn to eaves with a door and nothing else, and its roof sat diagonally across the walls. 829 Aylmer houses had 3 or fewer façade openings. This is what Tom calls "slapped on textures across the whole thing". | `longsault-16-before` (20 m brick wall on the right), `home-13-before` (neighbour on the left) |
| W2 | **Walls not grounded.** The same texture ran from the grass to the eaves, with no foundation, no contact darkening and no weathering. Windows were flat stickers standing 6 cm proud of the wall. | every house shot |
| W3 | **Flat light.** A hemisphere fill of 2.1 against a sun of about 2.6 flattened every face. There was no grade, the sky was a pale two-stop gradient, and the thin fog gave no sense of distance. | `*-13-before` |
| W4 | **Dead nights.** Pitch-black sky, dark roads, no lit windows anywhere in the town. | `*-23-before` |
| W5 | **Ground in one colour.** Each photo was tiled at one fixed scale, grass was a uniform green and asphalt a uniform grey. | `glenwood-13-before`, `marina-13-before` |
| W6 | **Brick shimmer.** Atlas mips were made with one `drawImage` from full size, so distant brick turned into moiré stripes. | `longsault-16-before` (right) |
| W7 | Audit defects this lead owns: buried storefront signs (S1), camera inside landmarks (S1), floating driveways, the headlight shadow map rendering at noon, a `THREE.Color` per draw, and the turntable renderer leak. | `docs/review/world-performance.md` D1–D4, D7, D10 |

## 2. What GTA IV does right, and what fits here

Research was brief: one grounded search plus general knowledge. Treat the details as indicative, not sourced fact.

- **Time-of-day grading** (RAGE `timecyc`). Each hour and each weather has its own tint, contrast and saturation curve, so the city has a mood. *Fits:* a small split-tone, contrast and saturation grade after ACES, with day, golden-hour and night presets. It runs in the tone-mapping chunk, so it costs no extra pass.
- **Aerial perspective.** Dense distance haze that picks up the sun's colour when you look toward it, which gives depth and hides the draw distance. *Fits:* exp² fog with sun in-scatter and a height falloff, run through the same tone curve as the sky so the horizon has no seam.
- **Many small lights at night.** GTA IV uses deferred lighting for hundreds of lamps. The key visual is lit windows and a glowing sky over the town. *Fits:* emissive glass in the existing shaders. About half the rooms light up, hashed per room, with warm tungsten tints. Add a sodium-orange horizon glow. It is free: no extra lights.
- **Facades with depth and grime.** GTA IV used baked AO, dirt at the base, recessed windows and interior mapping. *Fits:* foundation strip, contact darkening and slow weathering from the footing up. Shade the head of each window pane. Glass turns glossy so it reflects the sky. Interior mapping is a later option (section 4).
- **Wet roads.** Rain lowers roughness so lamps streak on the asphalt. *Fits:* when `weather.wet` is on, road roughness drops to about 0.25 and the asphalt darkens.
- **Dense clutter and believable proportions.** Signs, poles, bins, parked cars, porches. Much of this already exists (streetprops, porches, fences). The biggest proportion bug was W1.
- **Not taken:** bloom, depth of field, motion blur, SSAO and real-time reflections. They are either against the MM2-era decision or cost a post-processing pass, and three.js addons are not vendored.

## 3. Ranked changes, cost and status

Cost is engineering effort / runtime cost.

| Rank | Change | Cost | Status |
|---|---|---|---|
| 1 | **Square skewed LiDAR ridges to the footprint**, and glaze the real wall behind any internal face (houses.js `squareRidge`, `outerWall`) | small / +4 % near-house tris | **Done** (eaeaa61). Houses with ≤3 openings 829 → 129; openings per house 12.0 → 14.2. Affects both renderers. |
| 2 | **Lighting and grade:** ACES plus grade presets, sun 3.3× against hemi 1.05 by day, exposure per hour, deeper sky with a horizon band and sun glow | small / nil | **Done** (92f023b) |
| 3 | **Night:** lit windows (decal glass and vertex-colour panes), stars, town glow, brighter night fill | small / nil | **Done** (92f023b) |
| 4 | **Grounded walls:** foundation strip, contact darkening and weathering on house and landmark walls. Uses a +1000 v sentinel and the footing as `oy`, prototype only. | small / a few ALU ops | **Done** (92f023b, fc3fae9) |
| 5 | **Aerial haze** with sun in-scatter and a height falloff, tone-mapped like the sky | small / nil | **Done** |
| 6 | **Ground variation:** each photo at two scales and rotations, dry summer grass patches, patched and stained asphalt, wet-road gloss | small / 3 extra texture taps on ground | **Done** |
| 7 | **Glass** turns glossy (roughness 0.1), and the window head shades the pane | tiny | **Done** |
| 8 | **Mip chain** halves step by step with high-quality smoothing (H2) | tiny, load only | **Done** |
| 9 | Audit S1: storefront signs rebuilt on the height field (D2) | tiny | **Done** (d73dd28). 0 boards underground. |
| 10 | Audit S1: landmark walls are solid for the chase camera (D1) | tiny | **Done** (9ba274d). Probe misses 385/397 → 2/397. |
| 11 | Audit: driveways drape on the lawn (D3) | small / flat lots unchanged | **Done** (cd196ed). Float p99 1.15 m → 0.00 m. |
| 12 | Audit: headlight shadow map only at night (D4); no per-draw or per-frame allocations in the adapter (D10); turntable renderer released on drive (D7) | tiny | **Done** (92f023b, e5ec7d2) |
| 13 | Non-house commercial and industrial blocks in world.js are still plain vertex-colour boxes, several with no openings | medium | Next. Give `buildPlain` and world.js commercial walls the facade sentinel plus shader-procedural storefront and window bands. |
| 14 | Trees: cones and pink "crabapple" cones read as toys | medium | Next. Use the existing CC0 tree models (`assets/models/tree-*.json`) near the camera and billboard cards far away. |
| 15 | Eaves and trim: deeper overhangs, fascia boards and corner boards on archetype houses | medium / about 8 tris per house | Next, inside the 160-tri budget |
| 16 | Interior mapping for storefront glass on Principale | medium | Later. Waits for the Principale photo pass (backlog P1). |
| 17 | Streetlight fade when the six lights are reassigned (H4); lamp occlusion | small | Later |
| 18 | A narrow-band colour pass per neighbourhood (warmer Vieux-Aylmer, cooler 70s Lucerne) | small | Later, with Tom's reaction to the grade |

## 4. Performance (same poses, same session, alternating builds)

Harness: one headless Chrome on Metal (Apple M4), 1280×800, quality med. The baseline is `fe30d92`, served from a clean archive on a separate port. Each pose/hour takes 180 rAF intervals, then 25 synchronous `render()+readPixels` calls (the "cost" column: CPU+GPU for one frame, not bound by vsync). There were two alternating rounds of each build. Load average fell from 3.1 to 2.9 over the runs. Earlier runs at load 10–15 were discarded.

| pose @ hour | frame median / p95 ms, before | after | render cost median ms, before (r1, r2) | after (r1, r2) |
|---|---|---|---|---|
| home 13 | 16.7 / 17.7–18.8 | 16.6 / 18.1–18.2 | 4.8, 8.2 | 8.3, 7.8 |
| home 23 | 16.7 / 18.1–19.5 | 16.6 / 18.7 | 4.4, 4.0 | 3.8, 7.3 |
| glenwood 13 | 16.7 / 18.0–18.8 | 16.7 / 18.2–18.3 | 4.5, 6.3 | 3.9, 8.1 |
| glenwood 23 | 16.7 / 18.3–18.4 | 16.7 / 18.0–18.7 | 4.1, 8.2 | 7.5, 7.6 |
| principale 13 | 16.8 / 18.1–18.5 | 16.7 / 18.1–19.0 | 5.4, 6.2 | 6.1, 6.6 |
| principale 23 | 16.7 / 18.4–18.9 | 16.7 / 18.5–19.3 | 5.2, 5.0 | 10.0, 6.9 |
| marina 13 | 16.6 / 18.7–19.6 | 16.7 / 18.0–19.0 | 6.3, 5.4 | 5.6, 4.1 |
| marina 23 | 16.6 / 18.8–19.4 | 16.6 / 18.6–19.0 | 5.7, 5.1 | 6.2, 6.2 |

- Both builds hold 60 fps: median 16.6–16.8 ms, p95 under 19.6 ms at every pose.
- Single-frame render cost is 4–10 ms for both. Run-to-run spread on this shared machine (±3 ms) is larger than any difference between builds, so no regression is measurable.
- Draw calls and triangles per frame are unchanged, within ±3 %.
- Programs go from 11 to 13, because of the new `building` shader role.
- `performance.memory.usedJSHeapSize` at the end of the pose run was 1452 and 1643 MB before, and 612 and 625 MB after. This counts uncollected garbage, so it reflects the allocation rate (D10: a `THREE.Color` per draw, per-frame vectors and matrices, the pole sort), not retained memory.
- Not measured here: the 5-minute moving route in world-performance.md §4.4 and the menu-only heap (D7). Both are recommended for the next measurement pass.

## 5. Hooks for main.js (systems agent)

None required. The signage fix lives entirely in `signage.js`: `buildSignage` remembers the height field of the first bake. The turntable disposes itself on `stop()`.

## 6. Known limits

- 129 Aylmer houses still have 3 or fewer openings (odd footprints, tight budgets). Side walls of some bungalows are still blank.
- Glenwood photo houses, Fraser and landmark vertex-colour panes are detected by colour (dark blue-grey, vertical). A dark navy painted surface on a building would also light up at night. None was seen in the review shots.
- The lit-window hash works per 7 m × 2.7 m cell, so a wide window can occasionally straddle two cells and be half lit.
- The grade and exposure presets are first choices. They need Tom's reaction ("too dark / too orange / too clean") before any fine-tuning.

---

## 7. Combined (branch `qr/vis-combined`)

`qr/vis-combined` merges both passes below: nature (7a) and buildings (7b). In `renderer.js` the facade chunk (`FACADE_GLSL`) runs after the foliage chunk and is skipped for leaf cards (`amLeaf`), and the glass test skips leaves as before. The shader cache key is `v4`. 299 Fraser takes both options: `{ nature, proto }` gives the shader brick, hipped roofs and sills together with the leaf-card hedge, maple and spruce. Combined shots are `docs/design/shots/<place>-<hour>-combined.jpg`.

---

## 7a. Nature and ground pass (branch `qr/vis-nature`)

Shots: `docs/design/shots/<place>-<hour>-nature.jpg`. The poses are reconstructed (a road point near each place, facing it), so they do not frame exactly like the `-after` shots.

- **Trees** (`src/game/vegetation.js`, prototype only; the classic renderer keeps its cones): maples, elms and birches with tapered trunks, branches, a dark core and 16-24 double-sided leaf cards; spruces and white pines with a core cone and drooping bough tiers; columnar cedars. The shader (`src/prototype/nature.js`) cuts procedural leaves and needles with an MSAA-antialiased edge, also in the shadow pass (dappled shadows), and sways them in the wind. Past 30-120 m the leaves fade to the ragged clump outline. That is the only LOD: there is no billboard impostor. Trees stay in the land chunks, so knock-down and debris still work.
- **Shrubs and hedges:** rounded shrubs with leaf cards; cedar hedges on one lot line for about half the houses (clipped off walls, roads and pavement); 299 Fraser's hedge, red maple and young spruce are rebuilt in place.
- **Ground:** darker olive lawns with blade colour, hue drift, dead spots, bare dirt and a grazing sheen; weathered asphalt with sparse wandering cracks, tar snakes, patches and oil; worn paint; gravel shoulders and drives.
- **Sky:** fbm cumulus in the sky shader, lit from the sun side, overcast in rain. The sky now draws after the opaque world.
- **Night:** soft additive sodium pools, yellower streetlights, headlight glow and a road wash.
- **Hydrants:** Gatineau safety red, on the grass behind the walk.
- **Cost:** frame median 16.6-16.7 ms and p95 at most 17.6 ms at every pose and hour, as before. The synchronous single-frame cost rose from about 5 ms to about 9 ms median (noisy, ±3 ms). Triangles at residential poses went from 120-175 k to 240-285 k (trees and hedges).
- **Not done:** the marina (riprap breakwater, boats, promenade height, and the 10 m land bump at about x -1870, z -110 in the ground height field that reads as a hill in the lake); gravel drives for ordinary houses (houses.js); lot fences.

---

## 7b. Buildings pass (branch `qr/vis-buildings`, 29 September 2026)

Tom's complaint was that houses were "slapped on textures" and commercial blocks were plain boxes. This pass puts the detail in the fragment shader where it costs no triangles, and adds geometry only where the silhouette needs it. New shots are `docs/design/shots/<place>-<hour>-buildings.jpg`, plus `fraser299-<hour>-closeup-buildings.jpg` and `principale-13-storefront-closeup-buildings.jpg`.

### What changed

| Area | Change | Where |
|---|---|---|
| Brick | Running bond at true size (20 x 6.5 cm faces, 1 cm joints, 7.5 cm courses), per-brick colour spread, fades to the average colour at distance so it cannot shimmer | `src/prototype/facade.js` `amBrick`, used on house brick tiles, red-brick blocks and 299 Fraser |
| Roofs | Three-tab shingle courses (14.3 cm exposure, 33 cm tabs) running level along the eave; weathered colours only (charcoal, brown, a green-grey), never pale grey | `amShingle` |
| Siding | Yellow clapboard and cedar shakes drawn as lapped courses at true size. This was the "very weird texture" house near Principale: a photo stretched to 2.4 m boards | `HOUSE_GLSL` |
| Windows | Every house window and picture/bay window is a "sized decal" (`atlasRect = [w, h, -0.5, style]`): frame, projecting sill with its shadow line, muntins or meeting rail, recessed glass with a parallax reveal on the far jamb and head, curtains or a half-drawn blind in about half the rooms, shutters (4 colours) on about a third of older and colonial houses, brown frames on some brick houses | `amWindowPane`, `houses.js windows()` |
| Heights | Ground floors sit over a 60 cm basement wall: sills about 1.45 m above the lawn (were 0.6 m), the front door 45 cm up a concrete stoop | `houses.js FLOOR_LIFT, DOOR_LIFT` |
| Eaves | A 20 cm fascia band and soffit under every roof near the camera (both renderers), downspouts at the front corners | `houses.js fasciaBand` |
| Lived-in | Porch lamp by the door (lit after dark on ~70 % of houses), house-number plaque, wall mailbox on older streets, blue or green recycling bin at the curb on ~40 % of lots | `houses.js` |
| Duplexes | Old Vieux-Aylmer semis get an upper gallery with a straight exterior stair (only 4 such houses in town) | `houses.js` |
| Garage doors | Sectional doors: 4 rows of raised panels, a window row on half of them | `amGarageDoor` |
| Commercial / industrial | Every non-house wall carries a façade code (`atlasRect = [along, up, -(kind*1000 + front*500 + h*10), length]`, prototype only). Street walls of shops get a kickplate, mullioned storefront glazing with a door bay and a lit shop floor behind, and a blank painted sign band; upper floors and apartments get punched windows with sills and lintels; industrial walls get ribbed cladding, a block base, roll-up loading doors and a clerestory band; every block gets a parapet coping. Real geometry: fabric awnings on about two thirds of shopfronts and rooftop units on the bigger roofs. No windowless boxes remain near roads | `FACADE_GLSL`, `world.js facadeQuad / facadeExtras` |
| Night | Big storefront panes glow softer than house windows; coloured sign boxes glow faintly (pre-LED); lit house windows drop from ~48 % to ~42 % of rooms | `renderer.js GLASS` |
| 299 Fraser | Shader brick instead of 26 mortar strips, hipped main and garage roofs as in the menu art, fascia, sills, downspouts, roof vents, paneled garage doors, plain ground-floor panes (no cross-members, per Tom) | `fraser.js` (`opts.proto`) |
| Marina | The capitainerie stands on a 1 m stone quay with steps and deck piles, instead of at the water's surface | `landmarks.js buildMarina` |

`index.html` keeps its look apart from the fascia bands and the raised door/windows: all shader codes are ignored by `core/gl.js` (negative `atlasRect.z` is an ordinary decal there) and the façade codes and extras are only emitted when `mats.prototypeStyle` is set.

### Cost (same harness as section 4: 1280x800, M4 Metal, quality med; the 25-frame render cost is too noisy on this machine to rank builds, ±3 ms)

| pose @ hour | frame median / p95 ms before | after | triangles before | after |
|---|---|---|---|---|
| home 13 | 16.7 / 17.6 | 16.7 / 17.5 | 119.7k | 121.7k |
| home 23 | 16.7 / 17.5 | 16.6 / 17.4 | 117.8k | 119.8k |
| glenwood 13 | 16.7 / 17.4 | 16.6 / 17.6 | 158.4k | 160.1k |
| principale 13 | 16.7 / 17.4 | 16.7 / 17.5 | 175.7k | 175.5k |
| store (Principale block) 13 | 16.7 / 17.6 | 16.7 / 17.4 | 163.9k | 164.9k |
| industrial 13 | 16.7 / 17.5 | 16.6 / 17.6 | 157.9k | 159.4k |

- 60 fps holds everywhere (vsync-bound, p95 under 17.7 ms). Programs unchanged (11 to 13).
- Near-house triangles, all 10 110 town houses at lod 0: mean 90.1 to 126.3 (prototype), 102.0 (index.html); worst 163 to 172. `tools/smoke_houses.mjs` (stub materials) passes: mean 105.7 of 140, worst 161 of 165.
- Façades, brick, shingles and windows are fragment work only. Commercial walls in the prototype drop their old window quads, which pays for the awnings and roof units.

### Known limits

- Storefront glass facing away from the sun still reads dark by day; interior mapping (rank 16) would fix it properly.
- Brick courses only show within about 40 m; beyond that the wall settles to its average colour on purpose.
- Shutters, curtains and porch-lamp choice hash on world position, so two houses closer than a few metres can match.
- The capitainerie quay sits on the terrain agent's narrow shore strip; the lot and promenade around it are theirs to widen.
- Driveway surfaces and lot separation belong to the ground pass; houses still take their size from OSM footprints.

---

## 7c. Streets status / next steps (branch `qr/vis-streets`, WIP, 29 September 2026)

Tom's review of the `-combined` shots, answered before any street change:

1. **Glenwood "looks like a different street": it is a different camera pose, not changed geometry.** The first pass (`-before`/`-after`) shot Glenwood from the road point nearest (790, 329), yaw -1.47, looking down the straight block. The nature and buildings passes reconstructed their own poses (`/private/tmp/claude-501/vis-buildings/poses.json`: glenwood at 786.7, 403.9, yaw -2.80), which frames the cul-de-sac end instead. Re-shot at the first-pass pose on the combined build: `docs/design/shots/glenwood-{13,205,23}-firstpose.jpg` shows the same houses, the same continuous sidewalks on both sides and the same street as `glenwood-13-before.jpg`. The broken sidewalk pieces and the short driveway in `glenwood-13-combined.jpg` are real, though (see 3 below).
2. **Principale "completely changed the building": also a different pose.** The first pass shot Principale from (-905, -100), yaw 1.57, beside the red-brick house with the white porch (Vieux-Aylmer, near l'Hôtel British). The later passes' "principale" pose is (-538.1, -70.6), about 370 m east, in a strip-mall lot facing a painted commercial block and its neighbours. No landmark or photo facade was replaced: at the first-pass position the red-brick porch house is still there with the same shape (`principale-13-firstpose.jpg`, left). All later review shots should use the first-pass poses (listed in section 7c's harness note below).

Harness poses for like-for-like shots (first pass): home (915.18, 142.57, yaw 1.6722); glenwood nearestRoad(790, 329), yaw -1.47; principale (-905, -100), yaw 1.5708, not snapped; marina nearestRoad(-1766, -88). Script: `/private/tmp/claude-501/streets/cdp.mjs` (port 8155/9235). Note the principale pose now starts under a canopy because teleport places the truck differently; nudge it toward the road before the next comparison.

| # | Tom's note | Status |
|---|---|---|
| 1 | Glenwood looks like a different street | Answered: different pose (above) |
| 2 | Principale building changed | Answered: different pose, no building restyled (above) |
| 3 | Sidewalks stop, stray paths, driveways | Not done. Causes found: `world.js` sidewalks are cut by `clearRuns` wherever any other way (including OSM service driveways) overlaps, which leaves dead ends mid-block; every residential street gets walks on both sides; `houses.js driveway()` length is the archetype `setback + 2`, not the real distance to the curb, so drives stop in the lawn; `frontWalk()` runs `setback` metres straight out from the door and ends in the grass. Fix plan: keep the slab continuous across service crossings (flush concrete apron instead of a gap), a per-street policy (none / one side / both, hashed on the street name), and an `opts.curbDist(x, z, nx, nz)` ray to the asphalt edge for driveways and walks (walk goes door to driveway) |
| 4 | Oil-like stains, lines across asphalt | Not done. Tar snakes crossing the full width and the dark oil blobs are visible in `glenwood-13-firstpose.jpg`; they come from the nature ground shader (`nature.js`) and the wear decals in `world.js` (patch + crack stripes, disc) |
| 5 | Lifting shingles, 299 Fraser door sidelites | Not done |
| 6 | Saturn SL proportions and colour | Not done |
| 7 | Hydrant at 299 Fraser further left, on the grass | Not done |
| 8 | Headlight position and glow | Not done |
| 9 | A few pedestrians near 299 Fraser | Not done (peds already appear on the first-pass Glenwood shot) |
| 10 | Realistic interior light | Not done |

Performance was not changed (no renderer code touched). First-pass-pose readings on this build: principale 13 frame median 16.7 ms, p95 17.1 ms, 195.5k triangles.

---

## 8. Marina pass (branch `qr/vis-marina`, WIP)

Shots: `docs/design/shots/marina-{13,205,23}-marina.jpg`, `marina-13-aerial.jpg`, `marina-13-quay.jpg`, `marina-13-club.jpg`; before: `marina-13-premarina.jpg`.

- **River "mountains":** LiDAR noise over open water (10-14 m cones at about (-1874, -114) and (-1976, -156)). `world.js shapeRiver` holds every wet node whose 16 m neighbourhood is all wet at -1 m. Shore nodes are untouched.
- **Basin:** `shapeRiver` cuts the basin (and land within 4.5 m of the quay lines, and the old spit raster at the breakwater tips) to -1.8. `terrain.js marinaPads` adds `abs` pads (new: H is an altitude, not an offset): the west breakwater with a widened lighthouse tip and the short south arm (1.4-1.5 m, gravel path, 4-5 m slopes), and the east and north quays (1.35 m, a vertical face 1.5 m out in the water). Physics and mesh agree, as for every feature. `waterAt` returns false where these stand above 0.6 m. `smoke_terrain` exempts `abs` pads from the "offset, not altitude" and "no wall taller than 2.2 m" sweeps (a quay face drops into water). The `smoke_world` triangle ceiling went from 4.70 M to 4.76 M.
- **`src/game/marina.js`:** faceted riprap (about 2k rocks, 15 tris each), quay coping, fender line and bollards, five finger docks off the east quay (gangway, floats, piles, finger slips) and a guest dock on the south arm, with about 150 sailboats (mast, stays, boom cover) and runabouts. In the prototype, boats carry u = 5000 + phase, and `nature.js` heaves and rolls them. Rocks carry u = 5100, and the GROUND shader skips both. The 3 plank piers, the shore sand strips and the boulders inside the basin are gone.
- **Aylmer Island:** a low wooded island at (-4060, -330), about 2.2 km west, in the `distant` mesh (the only one drawn past 950 m). The distant apron west of the map is now water south of z -700, not lawn.
- **Landmarks (`landmarks.js`, marina only):** the lighthouse is lifted onto the breakwater tip. The capitainerie moved from the south arm to the east quay at (-1684.6, -106.4), yaw -2.165: its long side is parallel to the quay, the deck faces the water, and it stands at promenade level. The site uses `ground: true`, the sign moved with it, and the basin piles and picnic table were removed. **Merge over `qr/vis-combined`:** the buildings pass added a 1 m stone plinth (`QY = 1.0`), steps and deck piles inside `buildMarina`. Keep those, but set `QY` to about 0.3, because the building now stands on 1.0-1.3 m ground. The only conflicts are the `MA`/`MA_CAP` constants, the removed piles block and `siteMarina`. **Merged 2 Oct 2026 (session 2):** git merged `landmarks.js` without a conflict; the plinth, steps and deck piles are kept and `QY` is now 0.3.
- **Cost (marina pose, M4, 1280x800):** before 16.7 ms median, 17.7 ms p95. After 16.7 ms median, 17.7 ms p95 at 13, 20.5 and 23 h. Single-frame cost is 5-9 ms.
- **Not done / next:** fences and ordinary-house driveways are generated in `houses.js` (`residentialFence`, a three-sided fence on the house's oriented bounding box, not the lot; `driveway()` asphalt), which this branch may not touch. Hand them to the buildings agent: fences only on real rear and side lot lines, and gravel for pre-1970 drives. Still to do: parking-lot striping and the Route Verte path along the promenade, lit quay lamps at night, a closer check of the tie-in between the quay ramps and the lawn, the ground-level look from the north quay, and Tom's review.
