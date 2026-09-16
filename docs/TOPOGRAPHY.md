# Topography: putting Aylmer on a real hill

Version 0.3, 14 September 2026. Status: the drive-test slice is built and driven
— pieces 1 and 2 in full, and the cheapest honest version of 3, 4 and 5. The
town stands on 47 m of LiDAR. Piece 3 proper is still owed.

## Changelog

* 0.3 (2026-09-14) The spike ran, and then ran again on the full download, which
  changed its answer twice. The drive-test slice landed: `tools/build_ground.py`,
  `src/game/ground_data.js`, `ground.js`, `terrain.js`'s second layer, the whole
  of `world.js` draped, cars and pedestrians and debris off the floor, and the
  nine hero landmarks carried up the hill after them. Corrected numbers below,
  and what piece 3 still owes.
* 0.2 (2026-09-14) The ground raster already exists inside `tools/lidar_roof.py`
  and was being discarded. Piece 1 is now mostly written, and the spike is one
  command instead of a day.
* 0.1 (2026-09-14) First draft. Scope, the five pieces of work, the go/no-go spike.

## What the ground was

`src/game/terrain.js` line 3 used to say it plainly: the base height is exactly
zero everywhere, and a hand-written list of 20-odd analytic features sits on top
of it. `groundAt(x, z)` is one 40 m grid lookup plus two or three closed-form
evaluations, it allocates nothing, and it returns a shared record.

Two consequences mattered more than anything else in this document.

`world.js` baked the ground as **one flat quad per 200 m chunk**. Two triangles
per chunk. There was no ground mesh to deform, because there was no ground mesh.

`world.js` baked each road as a ribbon of quads at **one constant `y` for the
whole road**. A road did not know the height of the ground it crossed.

The physics is the third thing, and it did not have to change at all. `cars.js`
forces the car's vertical velocity to `slope * speed` whenever the wheels are on
rising ground, which is what makes a ramp a ramp (`jumps.js` documents the
formula at line 12). Real ground has slope everywhere, and the model was already
waiting for it.

## What the ground is now

`terrain.js` has two layers. The base is the LiDAR raster — 637 x 444 nodes at
8 m over the Aylmer clip, bilinear in height *and* in the pre-baked node
gradient, so the surface and its normal are both C0 across every cell edge and
a car crossing an 8 m line feels nothing. The features of `FEATURES` sit on top
of it as offsets: the rail berm is 2.5 m proud of the hillside it crosses, the
marina slipway digs the same trench below the bank it used to dig below zero.

With no base handed in, the module is bit-identical to the flat one — 6,263,903
sample points compared with `Object.is`, zero differences, signed zeroes
included, because the flat path is a separate closure chosen at build time.
That is the rollback, and it is machine-checked on every run.

Cost: flat `groundAt` measures 128-146 ns a call; with the hill under it,
212-256 ns, 1.5 to 1.9x. The old 200 ns absolute budget does not survive twelve
float reads spread over 3.4 MB, so the test now pins the *ratio* at 2.5x with a
400 ns tripwire and says why.

## The question to answer first — answered

Aylmer along the river is flat. The Ottawa River sits near 59 m; Vieux-Aylmer,
the marina, Plage des Cèdres and most of chemin d'Aylmer are within a few metres
of each other. The relief worth driving is north and west, where the ground
climbs toward the Eardley Escarpment.

The answer, on the full raster: **47.1 m of relief** (2nd to 98th percentile)
and an **8.4 % steepest sustained 100 m grade** (99.5th percentile) across
57.6 to 110.3 m of elevation. Against a bar of 10 m and 3 %, that is not close.
It is also not what the spike said the first two times — see below.

## The five pieces, and where each one stands

### 1. A base height field — **built**

`tools/build_ground.py` resamples `data/raw/ground_8m.npy` onto the game clip at
8 m: 637 x 444 nodes, x -2540.6 to 2540.6, z -1769.2 to 1769.2. Every node goes
game (x, z) -> lat/lon -> `qcgrid.to_mtm9` -> bilinear, not a translate-and-flip.
MTM 9 has -0.47 degrees of convergence here and a 0.16 % / 0.50 % scale
difference, which a naive resample puts 20 m out at the corners. 283k scalar
projections, 3.6 s, offline.

The output is `src/game/ground_data.js`: a base64 Uint16 blob quantised to 5 cm,
754,652 bytes. `src/game/ground.js` decodes it once into three `Float32Array`s —
height with the datum subtracted, and the baked central-difference gradient —
in 16 ms, for 3.4 MB of typed array.

**The "no assets to download" answer.** Version 0.2 called this out as a real
cost, and it turned out not to be one. The height field is a **755 KB ES module
the game imports**, not a file it fetches: same trick as the water mask
(`build_map.py` -> `world.js`), so the README's promise stands word for word,
the smoke suites get the real ground for free with no fixture, and there is no
new failure mode where the map loads and the terrain does not.

### 2. Features become relative — **built**

Heights became offsets: `h = base + max(0, features)`, a `dig` subtracts from
the base instead of reaching below zero, and the gradient is the sum of the base
gradient and the feature's rather than the feature's alone. Outside the raster
the edge value fades over 400 m of smoothstep, product-rule term included,
reaching exactly 0 and exactly (0,1,0) at 401 m — so the 148 corridor, Hull and
Ottawa are untouched and the seam is a 6 % ramp, not a wall.

`tools/smoke_terrain.mjs` grew 330 lines and deleted none.

### 3. Roads get a profile — **lite: draped, not graded**

This is still the piece that is actually hard, and most of it is still owed.

What landed is the cheap honest version. Every absolute `y` in the road bake
became `baseAt(x, z).h + Y.<layer>` per vertex, with segments longer than the
raster cell subdivided first, so a 50 m segment on a 5 % grade no longer sinks
2.5 m mid-span. Asphalt, joint discs, dashes, edge lines, shoulders, stop lines,
sidewalk slabs and intersection hulls all follow the ground now — roads and
everything beside them, about 162,000 triangles' worth.

**What piece 3 proper still owes:**

* **Graded profiles.** A draped road carries every ditch, bridge deck and
  metre-scale artefact in the DEM straight into the car's vertical step. The
  real pipeline samples the DEM along each centreline, fits a profile that is
  smoothed (60 to 100 m moving average) and gradient-limited (about 8 %), makes
  *that* the road's truth, and then pulls the terrain toward the road inside a
  corridor 15 m either side so the kerb is not a cliff — the same blend-to-grade
  `ridge` already does over `run`.
* **Junction decks.** Intersection polygons are planar at their centroid's base
  height. On a 5 % grade a 30 m intersection floats or sinks up to ~0.75 m at
  its edges. A graded junction is its own small surface matched to the four
  profiles that meet in it.
* **Decal and lawn tessellation seams.** Markings, kerb corners, walks and lawn
  are each draped on their own sampling, and where a long thin decal crosses the
  8 m lawn grid at an angle the two disagree by a few centimetres and the
  markings fray. Both surfaces need to be cut on the same lines.

Budget a week, not a day, and expect the first drive through it to feel wrong in
ways that are only visible from the driver's seat. That has not changed.

### 4. Buildings and props find their footing — **lite: median plus a skirt**

Every footprint now sits at the **median** of the base over its own vertices
(the minimum leaves them perched) with a foundation skirt down past its lowest
corner where the slope needs one: 8,662 skirts, deepest drop 2.91 m, 111,596
triangles. `houses.js` already had `opts.y`; it had simply never had anything
but zero to carry, and carrying something exposed a bug — `roofOn`'s "is this
eave over 4.6 m" soffit test was asking the *absolute* height, so on a 30 m hill
every bungalow in Aylmer grew an underside nobody can get beneath.

Trees, shrubs, poles, boulders, docks, bins, storefront signs and the 1,600 prop
spots each take one `baseAt` sample. Water stays at `Y.water`, and the datum
keeps the banks above it.

The nine hero landmarks in `landmarks.js` are the same idea one level up: each
site is built at y = 0 exactly as it was written and the finished vertex buffer
is carried, whole, to the ground under it — marina -0.4 m, Auberge Symmes 2.3,
Symmes Junior High 15.9, 129 Frank-Robinson 18.8, Lord Aylmer 19.2, the Hôtel
British 21.5, Les Galeries 26.7, the two Hull sites at 0. The couch is still
5.62 m up the maple, which is now 24.41 m above the river.

### 5. The ground mesh — **built, no LOD**

Chunks over the raster became a grid cut on the raster's own 8 m lines, with
vertices shared across the chunk: **702 vertices a chunk**, not the 2,500 that
four-verts-a-quad would cost. The whole hillside is 14 MB, and the drawn surface
passes through every node the physics reads — median disagreement between mesh
and field **1.8 mm, p99 6 cm**. Chunks outside the raster stay one flat quad.

The plan's 16 m fallback was not taken, and `tools/smoke_world.mjs` says why: it
would save 10 MB of 67 and cut the corner off every other node.

Whole map, no sector filter: **2,423,144 town triangles and 254 MB before;
3,773,406 and 321 MB after.** Ground 738,024, landuse 338,880, skirts 111,596,
roads and their furniture ~162,000. Both `smoke_world` budgets are rebaselined
with the measurement written out beside them.

There is still no LOD on the ground. That is the next thing to want if the frame
budget gets tight; the chunk machinery already does distance LOD for houses
(`houseNearB` / `houseFarB`), so the pattern exists and does not have to be
invented.

## The data

`tools/fetch_lidar.py` pulls the Quebec classified LiDAR covering the clip from
the Ministere des Ressources naturelles et des Forets: project
2020_Outaouaisgatineau, 10 points per square metre, class 2 tagged as ground, no
login. **29 of the 30 tiles, 2.0 GB** — the south-west tile is all river and
returns a 404, which the script expects and skips. `tools/lidar_roof.py
--ground-only` rasterises class 2 at 2 m, fills the holes, and writes
`data/raw/ground_8m.npy` plus a JSON header, downsampled to 8 m by block mean,
which doubles as the low-pass the physics needs.

`data/raw/` is gitignored and is now also in `.assetsignore`: 2 GB of `.laz` and
the raster beside them are build inputs, nothing fetches them at runtime, and
Cloudflare caps a deployed file at 25 MiB. `data/` as a whole went in with it
for the same reason.

**The datum is the river, not the bank.** The rule written in 0.2 was "2nd
percentile minus a metre", authored for a bank and met by a river: on the full
raster the 2nd percentile *is* the water surface, because LiDAR water returns
come back classed as ground — a band at 58.5 m covering 12 % of the grid. That
put the river bed a metre *above* the water quad. The datum now sits 0.6 m above
that band, at **59.09 m**, so the bed is under the quad and the banks about a
metre over it. Game y runs -1.5 to 51.2.

The national HRDEM in the CanElevation series is the fallback if the Quebec
tiles ever go away. It is LiDAR-derived at 1 m and 2 m under the Open Government
Licence, and the HRDEM Mosaic is cloud-optimised GeoTIFF on the AWS Open Data
registry, so a windowed read of the Aylmer clip is possible without downloading
the province. Check its tile index covers Gatineau before planning around it.

## What it does to the money, and to the ramps

A sloped world hands out free airtime. The curve in `jumps.js` prices a jump by
the fourth power of its airtime, so a hop off a rise pays $1 and the 148 ramp
pays $150. Topography lands on top of that safely; it could not have landed on
top of the economy of the week before.

Ten of the eleven ramps still clear the 1.4 s floor, and the Hull ramp — off the
raster entirely — still flies 2.47 s to the last decimal, which is the proof
that every path off the hill falls back to exactly the call it used to make.

**L'Envolée des Cèdres does not.** 1.57 s and 29 m becomes **1.10 s and 20 m**
at the same 66 km/h entry, because its lip now sits on a base falling 3.34 %
along the jump axis and still falling 3.16 % forty metres out, which takes close
to two degrees off the dune's own takeoff. It is named in `smoke_jumps.mjs` with
its before and after and the base slope at the lip, rather than being quietly
made bigger. Nothing in `jumps.js` was touched. Whether the dune gets a steeper
takeoff or the ramp moves twenty metres west onto flatter sand is a design
decision and it is still open.

## The spike, and why its first two answers were wrong

```sh
python tools/fetch_lidar.py --venv          # once, builds data/raw/venv with laspy
python tools/fetch_lidar.py                 # all 30 tiles, ~2 GB
python tools/lidar_roof.py --ground-only
```

`--ground-only` prints four numbers: the elevation range, the relief from the
2nd to the 98th percentile, the steepest grade sustained over 100 m at the
99.5th percentile, and whether that clears the bar of 10 m and 3 %.

It said three different things, and only the last one is Aylmer.

* **15.4 %** (15.3 % once resampled onto the game grid), on a 4-of-30 tile
  download. A **fill cliff**: 77 % of the raster was constant 89.08 m hole-fill,
  and the steepest "grade" in it was the wall where the real tiles met the fill.
  The script prints that caveat on every partial run, which is the only reason
  it was caught.
* **5.8 %**, recomputed over the real-data window alone — the 2 km square the
  four tiles actually cover, x -855..1201, z -1585..471. Honest, and a
  four-tile view of a town that is 5 km across.
* **8.4 %** with **47.1 m** of relief, on all 29 tiles. This is the number.

The lesson is cheap to state and was expensive to find: **a hole-filled raster
reports its own seams as terrain.** Any statistic over a partial download is a
statistic about the download.

## Verdict

Cheaper than it looked, and the reasons hold up in hindsight. `groundAt` was
already the right shape, the feature system already blended to grade, the height
field had been getting built and deleted on every LiDAR run, and the physics
never needed a line. The slice landed in one wave, and the town reads as itself
from the driver's seat, which was the whole test.

Roads are still the whole problem. Draped is good enough to drive and not good
enough to ship, and the three things it owes are listed under piece 3.
