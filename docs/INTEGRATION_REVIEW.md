# Combined Aylmer Madness review — 15 September 2026

## What was recovered

The work was saved, but the previous integration stopped before its merge was committed. The newer Codex checkout retained six unmerged index entries. The original GitHub Clone checkout contained Claude's `drive-test` version, without the newer mission and storefront work.

The combined branch preserves both histories: newer work through `dfea47a`, including `d78c424`, `eca4506` and `96aeca9`, and Claude's `drive-test` through `3131b5d`. Claude's `048ad3b` main and `d508fef` drivetrain commits are ancestors of `3131b5d`. Recovery was performed in a separate full copy; the interrupted newer checkout was retained as a backup.

## Included work

| Area | Combined behavior and verification |
|---|---|
| Navigation | GPS draws the remaining route. GPS and world navigation smoke checks cover route progress. |
| Fraser opening | Ranger faces the garage; Margaret is visible beside it. Both parked car footprints and the exit clear the real map. Browser checked opening and automatic alternator job. |
| Title screens | Title menu uses the Fraser illustration. Summer opening and alternator introduction have readable text and reachable buttons. The sentence about Dad helping financially is removed from opening copy and story metadata. |
| Margaret | Dark brown hair with grey streaks; avatar checks updated to the requested appearance. |
| Missions | Dental pickup for Margaret at Dr Morin, Sol grocery errand, St. Vincent meal minigame and Royal Ottawa Russell pickup are retained. Meal, story, mission and historical-location checks exercise them. |
| Hidden cars | Heritage SVX discovery and Claude's NSX pursuit remain, including French heckles and Sara's stretched loser voice. Pursuit checks cover discovery, movement, speeds and interaction. |
| Historic Aylmer | Galeries storefronts and the older Principale buildings are retained, including Sol/PFK, Moca, old library, recreation centre and garage/dental locations. Landmark, historic mall and Principale checks pass. |
| Repairs | Hugo's garage uses quote, extra supplies and final invoice. Canadian Tire is a parts pickup rather than a second generic repair shop. Payment, cancellation, vehicle swap and insufficient-funds checks cover this. |
| Vehicles | 130 km/h Ranger and its 40% menu bar, faster other cars, 1987 Civic, terrain-aware handling and 240D smoke/restoration remain. Mercedes purchase $350 and restoration $800 are preserved. Small hops pay $0–$2. |

## Terrain integration

The existing full LiDAR height field is preserved; no replacement height field was built. The documented full-data result is **57.6–110.3 m elevation**, **47.1 m relief**, **8.4% sustained 100 m grade**: **worth integrating**. These are the full 29-tile results, not the earlier partial download's false cliff at the fill boundary.

Integration fixes ground waypoint pillars, mission markers, traffic and pursuit cars, Fraser trees/fences, storefront sign frames/text and site paving. Galeries' historic west wing now uses the customer doorway's ground height with foundation skirts. Loading dock walls and colliders use absolute terrain heights.

The ground mesh regression samples 55,146 positions and measures **0.0844 m maximum difference** from driving physics. Shared raster edges have 468 passing checks. Adaptive refinement adds 57,996 triangles, refining 1.7% of raster cells. The paving regression on the actual field measures **0.025 m maximum sampled error**, with **0.0166 m at the customer approach**. Original site triangle caps are unchanged.

Roads remain the documented *draped* implementation. Full road grading, comprehensive intersection decks and decal seam cleanup are still future work. This PR is a combined testable version, not a claim that every road junction has received a final art pass.

## Audio and music

The local browser review page at `/tools/integration-audio.html` renders the actual audio code and offers playable samples. All nine synthesized radio styles produce nonzero, unclipped output; measured peaks range from 0.181 to 0.649. Ranger, Civic and 240D engine pulls produce nonzero output and gear shifts; road, landing and collision effects also render below clipping.

A real radio defect was fixed: an already-built audio graph incorrectly reported itself unavailable, preventing station changes and resume. Radio suspension now also prevents an asynchronous music render from starting playback during pause. A dedicated regression covers graph reuse, station changes, pause/resume and power cycling. Live browser signal checks cover playback, suspension, resume, radio mute and restored volume.

Music is synthesized, rather than commercial song recordings. The cassette playlist contains no supplied recordings. Sara's voice uses the browser's installed speech voices; vocal character and pronunciation still need a listening check by the player. Automated signal checks do not assess how the speakers sound in the room.

## Local validation

Final results and synchronization details are recorded below when verification completes.

For a practical playtest: start a new Tom game; back out of Fraser; follow GPS to Canadian Tire; inspect the historic mall and loading docks; try Margaret's dental and Sol errands; test St. Vincent and Russell pickups; discover the SVX at Heritage; switch radio stations and pause/resume; buy and restore the 240D.
