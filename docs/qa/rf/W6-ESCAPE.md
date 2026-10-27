# W6-ESCAPE (builder w6-escape, 20 Oct 2026; wave 7 continued 27 Oct)

## Wave 7 (27 Oct)
- Merged fix/look-on-qr 786acf4 (ecdf028).
- 549988b: minimap red search circle. hud.js draw: fill rgba(255,95,77,0.13), stroke #ff5f4d 1.5 px, dash [6,4] (one reused array), crawl -t*12, before the cop blobs; counts `hud.mapStats.search`. main.js hud.draw passes `search: G.cops.searchCircle()`; searchCircle() rewrites one object (no per-frame allocation).
- ebd1356: a new unit and the JUMP_D re-dispatch count as seen (`_radioSeen`, lastSeen = truck); lastSeen null falls back to the truck; seeded mulberry32 rng (`seed(n)`, constructor 1, reset keeps it); later search points snap to nav nodes inside the circle, never all-service nodes, never near a hide spot. Siren goes quiet at 4 s blind while searching (2 s after the circle shows), per C-16.
- tools/smoke_cops_search.mjs is now a full-tick test on the real road bake: fallback (no world, 600 ticks, no circle, every re-plan on the truck), search engages at 2 s blind, r 140 / 200, teach toast, siren quiet and stays quiet through the 1 s re-ask, every re-plan inside the circle and never on the truck once out, band 0.7, re-spot drops the search and the siren comes back, unseen clock holds inside the circle and runs outside, drain 0.22 x 1.6 after 6 s outside, escapePay(3) 180 > ticket 150.
- Colab: smoke_cops_search 36/0, smoke_race 215/0, RESULT GREEN (log colab-test/logs/ebd1356-1027-010200.log). The earlier "npm test via qa-slot" is superseded by the Colab rule.


Branch rf/w6-escape from fix/look-on-qr 813b1a7. Stopped at the 11:56 hard stop.

## Done (commit b508f8c), src/game/cops.js only, blocks marked [w6-escape]
- New exports SIGHT, BLIND_T, SEARCH (C-16 values; SEARCH.drain 1.6 and SEARCH.loseT 6 are mine, see decisions).
- `_sees(G, u, px, pz, stars)`: hear 45 m, range 110/110/140 m by stars, ray every 6 m against `G.world.buildingAt`. No world or no buildingAt: always seen, so smoke_race keeps today's path.
- Sight checked every 0.2 s over units and roadblock cars; `lastSeen` follows the truck while seen; `blindT` counts unseen time. Teleport re-dispatch counts as seen. Races: always seen, no search.
- Search engages at 2+ stars after 2 s unseen: circle at lastSeen, r 140 (2 stars) / 200 (3 stars). Units re-plan to search points (unit 0 lastSeen, unit 1 half r ahead, then a forward cone inside the circle), never the true position, band 0.7, re-plan every 5 s or on reaching the target. Seen again: search dropped, units re-plan to you, toast « Y t’ont revu. ».
- Losing them in a search: unseen clock holds inside the circle, grows outside it; outside the circle heat drains after 6 s (not 12) at 1.6x decay.
- Siren goes quiet 4 s into a search (lights stay).
- HUD feedback so far: toast on engage (« Y t’ont perdu de vue. / Sors du cercle rouge. », first 3 times, then « Y fouillent le secteur. »). `searchCircle()` returns {x, z, r} or null for the minimap.
- tools/smoke_cops_search.mjs (new): sight through a wall, fallback, range by stars, 200 search points inside the circle, clear() drops it. Passes.

### Hide spots (4cca000, 38042db, c85e1a2)
- assets/text/hidespots.json: 3 spots, placed on the VM with the C-16 rules (a one-off probe file, recycled after use). Distances only:
  - galeries « Derrière les Galeries » r 14: at the OSM rear lane point, moved 0 m; 107 m from a street centreline, 6 m from the service lane, nearest house footprint 117 m.
  - arena « Derrière l’aréna » r 14: PLACES.arena failed (14 m from the street, house 21 m), moved 14 m; street 25 m, house 33 m.
  - pont « Au pied du pont Champlain » r 16: Quebec end, 30 m back from the shore, 25 m off the deck; street 25 m, no house footprint within 200 m.
  - lave-auto CUT: its map point is inside the building, and the nearest point that passes is 38 m off (very likely outside the lot). Ship three, per the spec's default.
- public-place.mjs --task=W6-ESCAPE (docs/qa/rf/W6-ESCAPE.places.json): « all 3 public », exit 0 (7 private homes loaded; ran on the Mac, light, no world load).
- cops.js: HIDE, LEAVE, COPS_TEXT, setHideSpots, hideSpots, loadHideSpots (page self-loads once in update; node via fs). In a spot a cruiser sees you only under 16 m, or under 45 m if it saw you in the last 1.5 s (u.sawT). Stopped (< 3 km/h) and unseen: 8 s first star, 6 s each later; a cruiser within 30 m pauses (« Bouge pas… »); seen or rolling resets. 2+ stars drop one star (heat floor - 0.01, radio `drop`); at 1 star `escaped(G, 'hide', spot)`. Burned spot (used for an escape in the last 120 s): first star 12 s. The search also engages at 1 star while hidden (r 100); a re-plan while unseen in a spot goes to lastSeen, never the truck. Bust reach in a spot while unseen is BUST_D (12 m). `escaped(G, how, spot)` sets lastEscape { stars, pay, how, spot, x, z, t }, toast « Y ont passé tout droit. +N $ » for a hide; shared tail `_endChase`. After a hide, the cruisers go to `this.leaving` (dim pods, siren off, routed 400 m away, gone at 350 m or 20 s; never see, bust or count). Every cops prompt goes through `_prompt` and is kept in `promptText`. `hideState()`, `hideSpotsNear()` (one reused array). Radio lines from hidespots.json for search, respotted (at most one per 6 s), drop, escaped.
- Minimap: hide spots as 6 px hollow squares #9fd3ff while wanted (main.js passes `hides: G.cops.hideSpotsNear(f.x, f.z, hud.range)`).
- Police light ramming (S3-COPS BUMP) untouched. Escape pay unchanged: 3 stars 180 $ > ticket 150 $ (bar 4), asserted in the smoke.
- smoke_cops_search now 99 checks: per-spot hide (stars 2 at 7.9 s, down by 8.2 s, escape by 14.2 s, pay 60 $, leaving cruisers, prompt cleared, burned 12 s), rolling reset, pause at 25 m, reset at 10 m, watched-in at 40 m, no bust at 28 m, scripted escape stage pays 0 with heat < 0.05 and not chasing, data (rules per spot, 13 radio lines French and clean, COPS_TEXT clean), cost.
- Cost (VM, informational): 47.9 us/tick at 2 stars with sight on the real buildingAt vs 57.1 us/tick with no world. Sight costs less than the routing it saves (one nav.route per unit per 5 s in search instead of per 1.5 s).

## Checks (wave 7, all on the Colab VM)
- Full suite at c85e1a2: 102/105, the 3 failures are the known VM-only ones (smoke_audio, smoke_harness_gate, smoke_models): ct RESULT GREEN. smoke_cops_search 99/0, smoke_race 215/0, smoke_retry 191/0, smoke_lang 39/0, smoke_story_rules 3/0, smoke_verbs green. Log: colab-test/logs/c85e1a2-1027-011743.log. Lead: rerun those 3 on the Mac at merge.

## Not done (C-16 parts left, by choice of scope)
- Cops on rivals in races (step 7), setMaxStars, spawnCrossing, patrols, mapDots (step 8; they serve C-08 and C-14), the harness beat C-16.mjs and plan JSON, hud.js `cops` prompt source ranked first (C-09b's). Without that source a job's stage prompt can cover the hide countdown during a job.
- One paid escape a game day (C-10 `payOnce`): money.js on this head has no payOnce, so the hide escape pays like B-07's escape, every time. A player can farm 60 $ / 180 $ by provoking and hiding. Lead decision: wait for C-10, or cap here.

## Cloud checks for the lead
- Boot both entries, 0 console errors (hidespots.json fetch in the page).
- A 2-star chase, break sight behind buildings: red dashed circle on the minimap within about 2.5 s, siren quiet at 4 s blind, cruisers stop homing; leave the 140 m circle: stars drain from 6 s.
- Hide behind the Galeries at 2 stars: hollow squares on the minimap, countdown « Cachette, bouge pus. N », a star drops at 8 s, escape at about 14 s with « Y ont passé tout droit. +60 $ » and the cruisers driving off with dark light bars.
- 60 fps medium on the Air in a chase (no per-frame allocations added: searchCircle, hideState, hideSpotsNear reuse objects; one arc plus a few rects on the minimap).

## Wave 6 notes (20 Oct)
## Checks
- node tools/smoke_cops_search.mjs: ok. node tools/smoke_race.mjs: 215 passed, 0 failed (run directly with node, not via qa-slot; my mistake, small single file).
- npm test through qa-slot: started 11:46, no output by 11:55 (likely waiting on the one slot). NOT confirmed green. Lead: rerun.

## Next (in order, wave 6 list; 1-5 done in wave 7 except what is listed under Not done)
1. Confirm npm test green via qa-slot.
2. Minimap red circle: hud.js draw reads `G.cops.searchCircle()` (small block in main.js hud.draw call, mark [w6-escape]).
3. smoke_cops_search: full-tick test with a real world (fake buildingAt wall) asserting search engages, siren off after 4 s, drain faster outside circle, re-seen resets.
4. Hide spots per C-16 (hidespots.json, placement rules in node, countdown prompt, bust reach in spot, escaped(G, 'hide'), leaving cruisers). Not started.
5. Radio lines (lines.search/respotted) via hidespots.json once written; checked with smoke_lang breachOf.

## Browser checks for the cloud (lead)
- boot both entries, 0 console errors.
- A 2-star chase, break sight behind buildings: search toast within ~2.5 s, siren drops ~4 s later, cruisers stop homing; drive out of 140 m circle: stars drain. 60 fps medium on Air (sight is at most 2 rays of ~20 grid lookups per 0.2 s).

## Lead decisions
- Siren: C-16 says quiet once blindT > 4 s while searching, i.e. 2 s after the circle shows (that is what ships); the wave 6 note « 4 s into a search » was wrong.
- SEARCH.drain 1.6 and SEARCH.loseT 6 (faster drain outside the circle) are not in C-16, which keeps LOSE_T 12 and HEAT.decay; the task asked for faster drain. Keep or set drain 1 / loseT 12.
- No 1-star search yet (C-16 only engages 1 star inside a hide spot, which comes with step 4).
