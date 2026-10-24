# s1-hotel: the British Hotel "invisible wall" and the post-blitz sample

Branch rf/s1-hotel from 7ed4dfb. Task: redteam-2026-10-19/tech.md finding 3 and first-hour.md B-11 ruling.

## What the wedge at (-932, -97) is (step 1, read from code and map data)

Status: reproduced with a real-render probe (references/review/rf-s1-hotel/probe/probe.mjs, built on the red team's; output in probe/before/, SwiftShader, ports 8252/9452, boot 37.4 s, 0 console errors).

- Same stop as the red team: east along z -97 from x -960, pinned at (-931.79, -96.82) yaw 1.546 after 7.65 s, damage +10.32. Every collider within 4 m of the truck is a hero wall of the hotel's own OSM ring (west wall (-929.1, -92.7) to (-930.2, -103.3)). No other collider.
- With `A.render()` before the shot, stop-east-z97-rendered.png and view-east-from-parker.png show the British Hotel's stone west wall standing right behind Rue Parker's east sidewalk, with the truck stopped against it. Nothing invisible.
- T works there once the truck has really been pinned: after 4 s of W against the wall the offer is up (`A.feel().stuck` true), T moves the truck 4.2 m with the toast « Remis sur Rue Parker », and 2 s of W then moves it 6.5 m. The red team's sample held W for 2 s, under tow.js STUCK.pinnedAfter (3 s), so T was refused as designed.

- The box the red team quoted (`landmark:british`, x -934.3 to -897.7, z -134.7 to -86.2) is the CAMERA collider: `world.cameraColliders.addMesh(b.near, ...)` in landmarks.js installLandmarks, the AABB of the whole near mesh including the front walk out to the Principale sidewalk. Only camclip.js and main.js's chase camera read it. No car collides with it.
- The car collider is `bakeColliders(s)`: the same `walls(K, ring, ...)` call that draws the hotel registers each ring edge with `K.seg`. Drawn and collided rings are the same OSM ring (473653913).
- That ring's west wall runs (-929.1, -92.7) to (-930.2, -103.3). Rue Parker (w 8) is centred at x -936.0 at z -97, so its east kerb is x -932.0. The stop the probe recorded, (-931.8, -96.8) heading east, is the truck's centre on the kerb with its nose 2.26 m ahead, i.e. on the hotel's west wall. `roadAt` is true there because the centre is on asphalt (kerb + 0.8 m).
- The red team's stop-east-z97.png is not a picture of that stop: its probe stubbed requestAnimationFrame before driving and never rendered, so the PNG is the last frame the page drew during boot (the HUD shows 56 km/h).
- Why the bot gets there: in the failing packs (e.g. 20261013-195207-quick traces/course-blitz.csv) the bot runs south on Rue Parker at 72 km/h, overshoots the left turn onto Principale (z -83) by 14 m and then aims straight at checkpoint 4 (-867, -99, "Bancroft x Principale"), a line that crosses the hotel. So the wedge is the bot cutting a corner into a real, drawn wall, not a wall in the street.

## Changes

1. tools/review/beats/sample.mjs: the beat now teleports to boot.mjs's known pose (chase_chemin_aylmer, the long straight east on chemin d'Aylmer) with damage 0, waits for the truck to settle, then measures. It records where the last beat left the truck (`inheritedAt`, `inheritedKmh`) and puts the carried damage back afterwards.
2. tools/smoke_landmark_roads.mjs (new, in npm test): every hero site's car colliders (33 sites) against MAP.roads at the honest half width, plus "every collider stands on something drawn". Fails on 7ed4dfb (6 failures), green on this branch (73/73).
3. Fixes for what the smoke found:
   - aydelu (oldaylmer.js): its north wall stood 1.97 m into Rue du Patrimoine for 28 m (the bz_vieux line passes it) and its west wall across the lane at (-669, 7). Moved from (-661, 3) to (-653.9, 4.5) and 29 m to 26 m wide, inside its OSM footprint 68609642, between the two lanes; same height, roof and street face; sign moved with the face.
   - frankarena (oldaylmer.js): east wall 0.4 m into the end of Rue Lord-Aylmer; moved 0.5 m west.
   - Heritage rotunda (landmarks.js drum): colliders were every other chord of the far bake's 9-sided drum, standing 2 m inside the drawn glass. Now one per facet of the 16-sided near drum.
   - Esso and Ultramar pump islands (historicstrip.js): the collider was the island's centreline; now its 2.3 x 9 m outline.

## Needs a ruling (listed in SERVICE_KNOWN in the smoke)

36 hero walls cross OSM service ways (driveways, aisles, drive-throughs, school loops), most of them at the way's centreline: pwhs 12, galeries 5, mcdonalds 3 (the drive-through lane runs under the west wall for 28 m), esso 4, galaxie 3, loblaws 2, symmesjr 2, edeycorner 2, frankarena 2, heritage 1. They are drawn walls (no invisible wall), but the asphalt runs into them. Options per site: move the wall, cut the way at the wall, or accept. The suite fails on any new crossing or a deeper one.

## Checks

- smoke_landmark_roads: 73 passed, 0 failed (base: 67 passed, 6 failed).
- smoke_landmarks, smoke_landmark_ground, smoke_walls: green.
- npm test: 98/98 suites (97 plus the new one), exit 0 (references/review/rf-s1-hotel/npm-test.log).
- boot.mjs: index ok (36.1 s, 0 console errors, W moved 144.6 m), prototype ok (150.5 s, 0 errors, 144.6 m).
- `--plan quick --rev 15ade84` (references/review/rf-s1-hotel/quick-15ade84): exit 0, 12 beats, 0 console errors, 0 exceptions, worst beat mean 59.4 fps. Sample beat ok, 4/4 asserts: it started at the pose, moved 6.9 m, 22.9 km/h, while the blitz had left the truck at (-455.4, -127.2) at 12.3 km/h with 5.6 damage. Both bz_vieux columns failed on the clock (played at x -786 on du Patrimoine, fresh at x -465 on Principale). Neither reached the Parker corner this run, so the pack proves the sample no longer depends on where the blitz ends, not the wedge itself; the probe covers the wedge.

## Open for the lead

1. Finding 3(b) is not a collider bug: no change to the British Hotel. What remains is the bot. It takes the Parker to Principale left turn at 72 km/h, overshoots and aims straight at checkpoint 4 through the hotel (page-agent.js steerTo, no speed target into a sharp corner). It also routes cp3 to cp4 over Parker instead of straight down Bancroft. Owner: harness, not game.
2. The 36 hero-wall / service-way crossings in SERVICE_KNOWN need a ruling (move wall, cut way, accept).
3. aydelu is now 3 m narrower (26 m, not 29) to fit between its two lanes and inside its OSM footprint. It needs Tom's eye against his photo set.
