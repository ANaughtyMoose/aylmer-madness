# Topography: putting Aylmer on a real hill

Version 0.2, 14 September 2026. Status: the spike is built, nobody has run it.

## Changelog

* 0.2 (2026-09-14) The ground raster already exists inside `tools/lidar_roof.py`
  and was being discarded. Piece 1 is now mostly written, and the spike is one
  command instead of a day.
* 0.1 (2026-09-14) First draft. Scope, the five pieces of work, the go/no-go spike.

## What the ground is today

`src/game/terrain.js` line 3 says it plainly: the base height is exactly zero
everywhere, and a hand-written list of 20-odd analytic features sits on top of
it. `groundAt(x, z)` is one 40 m grid lookup plus two or three closed-form
evaluations, it allocates nothing, and it returns a shared record.

Two consequences matter more than anything else in this document.

`world.js` bakes the ground as **one flat quad per 200 m chunk** (line 361,
`bAt(...).flat(x0, z0, x1, z1, Y.grass, g)`). Two triangles per chunk. There is
no ground mesh to deform, because there is no ground mesh.

`world.js` bakes each road as a ribbon of quads at **one constant `y` for the
whole road** (line 698, the `y` in `bAt(mx, mz).quad([l0x, y, l0z], ...)`). A
road does not know the height of the ground it crosses.

The physics is the third thing. `cars.js` forces the car's vertical velocity to
`slope * speed` whenever the wheels are on rising ground, which is what makes a
ramp a ramp (`jumps.js` documents the formula at line 12). Real ground has
slope everywhere.

## The question to answer first

Aylmer along the river is flat. The Ottawa River sits near 59 m; Vieux-Aylmer,
the marina, Plage des Cèdres and most of chemin d'Aylmer are within a few metres
of each other. The relief that would be worth driving is north and west, where
the ground climbs toward the Eardley Escarpment, and on the Hull side where the
148 corridor falls to the river.

So the honest first question is not whether this can be built. It is whether the
real ground under the part of town you actually drive is interesting enough to
pay for any of the work below. That is what the spike in the last section is
for, and it costs half a day.

## The five pieces, in the order they have to happen

### 1. A base height field

Add `baseAt(x, z)` to `terrain.js`: a bilinear sample of a regular grid, plus
central differences for the gradient. Eight array reads, no allocation, which
keeps the promise the module's header makes.

Grid size decides everything. The playable clip runs roughly x -2000 to 8000 and
z -4300 to 700, call it 10 km by 5 km. At 8 m spacing that is 1250 x 625 =
781,000 samples; as Uint16 quantised to 5 cm it is 1.6 MB. At 4 m it is 6.3 MB.

8 m is the right starting number. It is finer than any real slope in Aylmer and
it is small enough to ship.

That 1.6 MB is a file the game downloads, and the README's first paragraph
currently promises "no assets to download". Adding the height field breaks that
promise. It is a real cost and it should be a deliberate decision, not a
side effect.

### 2. Features become relative

Every feature in `FEATURES` was authored against a base of zero, and `groundAt`
combines them with `max()`. The chantier ramp is `H: 2.9`, meaning 2.9 m above
the world. Put the base at 41 m there and `max()` returns 41, and the ramp
disappears.

The fix is mechanical. Heights become offsets: `h = base + max(0, features)`,
and a `dig` feature subtracts from the base instead of reaching below zero. The
gradient becomes the sum of the base gradient and the feature gradient rather
than the feature's alone.

Half a day, and `tools/smoke_jumps.mjs` tells you immediately whether it worked,
because it measures real airtime off the real bake on all eleven ramps.

### 3. Roads get a profile

This is the piece that is actually hard, and it is most of the project.

Sampling the height field at each road vertex does not work. A DEM carries
ditches, bridge decks, parked cars and metre-scale noise, and the car's vertical
step turns every one of those into a hop. A real road is graded: cut through the
high ground, filled across the low.

So the pipeline is the other way around. For each road polyline, sample the DEM
along the centreline, then fit a profile that is smooth and gradient-limited
(a moving average over 60 to 100 m, then clamp to about 8% grade). That profile
is the road's truth. Then pull the terrain toward the road inside a corridor
maybe 15 m either side so the kerb is not a cliff, the same way `ridge`
already blends to grade over `run`.

`world.js`'s road bake changes from one `y` per road to a per-vertex `y` from
the profile, and everything that sits on a road (`signage.js`, `streetprops.js`,
`traffic.js`, `peds.js`, the 14 places already calling `groundAt`) follows.

Budget a week, not a day, and expect the first drive through it to feel wrong
in ways that are only visible from the driver's seat.

### 4. Buildings and props find their footing

`data/buildings.json` and `data/hull_buildings.json` are 2D footprints placed at
y = 0. Each one needs a base height (the median of the DEM over the footprint
works, the minimum leaves them perched) and a skirt down to the terrain so a
house on a slope does not float at the back and sink at the front.

Two or three days, mostly in `houses.js` and the bake.

### 5. The ground mesh, and what it costs to draw

One flat quad per 200 m chunk becomes a tessellated grid. At 8 m spacing a
chunk is 25 x 25 = 625 quads, 1,250 triangles, against 2 today. With roughly
1,250 chunks in the clip that is 1.6 M triangles of ground alone.

That needs LOD: full resolution in the chunk you are in and its neighbours,
half or quarter beyond. The chunk machinery in `world.js` already does distance
LOD for houses (`houseNearB` / `houseFarB`, line 238), so the pattern exists and
does not have to be invented.

Three or four days, and this is where the frame budget gets spent.

## The data

You already have it, and you have had it the whole time.

`tools/fetch_lidar.py` pulls the Quebec classified LiDAR covering the clip from
the Ministere des Ressources naturelles et des Forets: project
2020_Outaouaisgatineau, 10 points per square metre, class 2 tagged as ground,
30 tiles of about 2.2 GB, no login. `tools/lidar_roof.py` then rasterises class
2 across the entire clip at 2 m into a grid it calls `gnd`, fills the holes,
takes one median per building footprint to measure roof heights above ground,
and throws the rest away at line 348.

That discarded raster is the base height field. Piece 1 above is not a
pipeline to build, it is an output to stop deleting.

As of version 0.2, `lidar_roof.py` writes it: `data/raw/ground_8m.npy` plus a
JSON header, downsampled from 2 m to 8 m by block mean, which doubles as the
low-pass the physics needs.

The national HRDEM in the CanElevation series is the fallback if the Quebec
tiles ever go away. It is LiDAR-derived at 1 m and 2 m under the Open
Government Licence, and the HRDEM Mosaic is cloud-optimised GeoTIFF on the AWS
Open Data registry, so a windowed read of the Aylmer clip is possible without
downloading the province. Check its tile index covers Gatineau before planning
around it.

## What it does to the money

A sloped world hands out free airtime. Every crest on every street becomes a
small jump, and before the payout rebalance of 14 September a 0.6 s hop paid $12
against $43 for the biggest ramp in the game. Adding topography to that economy
would have been a printing press.

The curve now in `jumps.js` prices a jump by the fourth power of its airtime, so
a hop off a rise pays $1 and the 148 ramp pays $150. Topography can land on top
of that safely. It could not have landed on top of the old one.

## The spike, before any of this

Two commands, and the download is most of the wall clock.

```sh
python3 tools/fetch_lidar.py --venv     # once, builds data/raw/venv with laspy
python3 tools/fetch_lidar.py --core     # the 4 dense-Aylmer tiles, not all 30
python3 tools/lidar_roof.py --ground-only
```

The last one prints four numbers and a verdict: the elevation range, the relief
across the clip from the 2nd to the 98th percentile, the steepest grade
sustained over 100 m at the 99.5th percentile, and whether that clears the bar.

The bar is relief of 10 m and a sustained grade of 3%. Under both, stop, because
the ground under the part of Aylmer people drive is flat and a height field
nobody can feel is a megabyte and a fortnight for nothing.

Over the bar, build piece 1 and piece 2 only, leave the roads flat, and drive
it. Roads floating slightly above or below the terrain looks broken, and it
tells you within five minutes whether the hills are worth the week that piece 3
costs.

One thing the spike does not do is put the raster in the game's coordinate
frame. It comes out on the MTM9 grid the LiDAR ships in (EPSG:32189), and the
game's frame is metres from a lat/lon origin at 45.394, -75.8355 (see
`tools/build_map.py` lines 37 to 47). At this latitude the two grids are within
about half a degree of rotation of each other, so the resample is a bilinear
pass and not a reprojection, but it is still piece 1's remaining work.

## Verdict

Not too difficult, and cheaper than it looked. `groundAt` is already the right
shape for this, the feature system already blends to grade, and the height field
itself has been getting built and deleted on every LiDAR run. Roads are the
whole problem, and they are a week of work that has to be done properly or the
town reads as a bad approximation of itself.

Run the spike first. Aylmer being flat is a real possible answer, and it is now
three commands away instead of a day.
