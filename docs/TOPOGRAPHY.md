# Topography: putting Aylmer on a real hill

Version 0.1, 14 September 2026. Status: proposal, nothing built.

## Changelog

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

The national source is the High Resolution Digital Elevation Model in the
CanElevation series, LiDAR-derived, 1 m and 2 m, published under the Open
Government Licence. The HRDEM Mosaic is distributed as cloud-optimised GeoTIFF
on the AWS Open Data registry, which means a windowed read of the Aylmer clip
rather than a download of the whole province.

Check the tile index for the clip before planning around it. HRDEM coverage is
built up survey by survey and the Gatineau side needs confirming, not assuming.
`tools/fetch_lidar.py` already exists in the repo, so some of this road has been
walked before. Read it before writing anything new.

The fallback is the Medium Resolution DEM of Canada at roughly 20 m, which is
too coarse for a ramp and entirely good enough for a town-scale slope.

## What it does to the money

A sloped world hands out free airtime. Every crest on every street becomes a
small jump, and before the payout rebalance of 14 September a 0.6 s hop paid $12
against $43 for the biggest ramp in the game. Adding topography to that economy
would have been a printing press.

The curve now in `jumps.js` prices a jump by the fourth power of its airtime, so
a hop off a rise pays $1 and the 148 ramp pays $150. Topography can land on top
of that safely. It could not have landed on top of the old one.

## The spike, before any of this

Half a day, and it answers the only question that matters.

1. Pull an HRDEM window over the 2 km square containing Vieux-Aylmer, the
   marina and the chemin d'Aylmer straight.
2. Smooth it to 8 m and print the numbers: total relief across the square, the
   steepest sustained 100 m grade, the grade along chemin d'Aylmer itself.
3. If the relief is under about 10 m and no sustained grade beats 3%, stop. The
   ground under the part of Aylmer people drive is flat, and a height field that
   nobody can feel is a megabyte and a fortnight for nothing.
4. If it clears that bar, build piece 1 and piece 2 only, leave the roads flat,
   and drive it. Roads floating slightly above or below the terrain looks broken
   and tells you within five minutes whether the hills are worth the week that
   piece 3 costs.

## Verdict

Not too difficult. `groundAt` is already the right shape for this and the
feature system already blends to grade. Roads are the whole problem, and they
are a week of work that has to be done properly or the town reads as a bad
approximation of itself.

Do the spike first. Aylmer being flat is a real possible answer.
