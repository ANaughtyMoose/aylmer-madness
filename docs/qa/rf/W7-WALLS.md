# W7-WALLS: hero walls out of the service ways (27 Oct 2026)

Branch rf/w7-walls (worktree wt-rf-w7-walls), from fix/look-on-qr 4b6f534.
Plan: references/review/redteam-2026-10-20/SERVICE-WALLS.md.

## Result

tools/smoke_landmark_roads.mjs SERVICE_KNOWN went from 36 entries to 10. The 26
fixed walls are gone from the list (it only shrank; no tolerance changed). The 10
left are the ACCEPTs: galeries kiosk 3, esso pump islands 4, edeycorner posts 2,
heritage 1. Every site was checked with a scratchpad copy of the smoke's own
crossing maths (no map or world loaded on the Mac), then on the Colab VM.

## Moves (12 walls)

| Site | File | Change | Why this and not the plan's 2.5 m |
|---|---|---|---|
| mcdonalds (3) | historicstrip.js | West face 3 m east (shop 14 x 28 at 319.5, -240.15, was 17 x 28 at 318, -240). Fascia board re-centred 316.4, 5.2 wide so it stays on the face. | 2.5 m left 0.2 m in the lane; 3 m clears. New west face is inside the OSM footprint (310 to 313.6). |
| galaxie (3) | oldaylmer.js | Whole building 7.5 m east and 2.5 m north, same 38 x 36 (site -662.5, 50.5; sign follows). | The lane jogs east to x -684.4 at z 36, so a face move had to be 7.5 m (a 19% shrink). Moving keeps the size and stays inside OSM (x -684 to -633); 2.5 m north also clears the 18 m stub on the south. |
| frankarena (2) | oldaylmer.js | Whole arena 22 m south, same 35 x 79 (site -606.5, 57; sign 16.5). | The hero sat 12 m north of its OSM ring (z 18 to 107) with its north-east corner on the lane behind the arena, which is the sc_arena shortcut. Clearing the corner needed the north face at z 97 or less; moving puts it on its OSM ring. |
| symmesjr (2) | landmarks.js | Gym 5 m north and 2 m narrower on the east (20 x 17 at -285.2, 375.05). Dumpster moved 6 m north out of the new gym. | The lane crosses the corner diagonally; 2.5 m of trim left 1 to 2 m in the lane. Clearance now 0.9 m. Site position is a guess anyway (comment in landmarks.js). |
| galeries wing (2) | landmarks.js historicMall | South-west corner of the 76 x 74 wing cut back 9 m along the south face and 11 m up the west face (a five-sided ring). | The driveway off Wilfrid-Lavigne turns south 3 m inside the old corner; a 2.5 m corner move did not clear it. Clearance now 0.86 m. The rest of the wing, its front, roof and skirt are unchanged. |

## Cuts (14 walls)

New module src/game/service_cuts.js, run once on the merged map from
mapdata.js right after applyHighwayToHull (tools/build_map.py emits the same two
lines, so a rebuild keeps it). Ways are matched by first OSM node id.

- pwhs (12): mode `cut`. Ways 1317513374, 13508458957, 13250029554, 5557762803
  stop 0.4 m of verge short of every PWHS block, link and lobby (the asphalt edge,
  not the centreline). Pieces inside the school are dropped; pieces shorter than
  3 m are dropped. 1317513374 becomes three pieces (east stub, a courtyard piece
  between the west wing and the north link, the west loop), 13508458957 two.
  Cut ends get negative ids so they join nothing.
- loblaws (2): mode `detour`. The lot loop 1025191749 now leaves the parade's
  north-east corner at the same clearance and goes round it (two new points), so
  the loop stays a loop.
- Road array: the first piece of a cut way keeps its index; extra pieces are
  appended after the Hull roads (3 more ways). period2004 already re-indexes the
  array, so nothing depended on the indices.
- Smoke additions (tightening only): service_cuts ran; every way has 2+ points
  and one id per point.

## Checks

- Colab, named: smoke_landmark_roads, smoke_landmarks, smoke_landmark_ground,
  smoke_camera_world, smoke_shortcuts on 6a3da3b (moves): GREEN. Same plus
  smoke_world, smoke_traffic, smoke_walls, smoke_historic_mall, smoke_sectors,
  smoke_ottawa on f63a605 (cuts): GREEN, 10 crossings listed.
- Full suite run 1 on 16fbb18: 112/115, only the three VM-only failures
  (smoke_audio, smoke_harness_gate, smoke_models): GREEN.
- Merged fix/look-on-qr 17fc765 (w6-curfew; clean, no overlap with these files).
- Full suite run 2 on 8ce3c13 (the merge): 112/115, only the same three VM-only failures: GREEN.

## Cloud checks for the lead (one drive-by per site)

1. mcdonalds: drive the drive-through lane north from (333, -264) round to
   (311, -218); no wall contact, building and fascia still look right.
2. galaxie: drive the lane from Rue du Patrimoine (-689, -11) north past the
   bowling alley to (-689, 80); the building sits east of the lane, porch and
   GALAXIE sign on the south face.
3. frankarena: run the sc_arena shortcut from Lord-Aylmer (-500, 112) to
   (-607, 152); the arena corner is beside the lane, not on it; the arena reads
   right on its new spot (south face and sign at z 16.5).
4. symmesjr: drive the campus lane from (-261, 373) to (-294, 399) past the gym
   corner; gym still joined to the main block visually.
5. galeries: from Wilfrid-Lavigne turn into the driveway at (-207, -322) and
   follow it south behind the wing; look at the cut corner from the boulevard.
6. loblaws: drive the lot loop north along the east side of the parade to
   (1002, -296); the asphalt bends round the corner.
7. pwhs: drive each lane end (east stub from 6858, -8106 west; north lane from
   6876, -7945 south to the gym; east loop to the link) and check the asphalt
   ends cleanly short of the walls, not in a wall.

## For the lead

- Moves at galaxie (7.5 m) and frankarena (22 m) are whole-building moves, not
  face moves, to keep the buildings their size. Both now sit on their OSM rings.
  If Tom remembers the arena further north, say so and it gets a face trim
  instead.
- The pwhs courtyard keeps a 70 m piece of lane boxed in by the school (not
  reachable by car). Harmless; drop it later if it looks odd.
- Not fixed (outside task): the sc_galeries shortcut passes (8, -283), 0.9 m
  from the accepted kiosk wall at x 7.1.

## Where I stopped

Done. All 26 fixes committed (one commit per site, plus the smoke check); both full runs GREEN. Waiting on the lead's drive-by checks and merge.
