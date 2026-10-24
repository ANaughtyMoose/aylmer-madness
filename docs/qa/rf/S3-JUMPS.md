# S3-JUMPS: every ramp flies the way its table promises, and the first job gets its air

Builder s3-jumps, ports 8276/9476. Base: fix/look-on-qr at 7272b85.

| branch | commits | what |
|---|---|---|
| rf/s3-jumps | 19fda97 report, 6687816 table + readout, e4eb033 Worker ramps, 1731277 / 37e586a / bcf4d00 beat fixes + arena, f559527 verge garnotte, then this report | steps 1 and 2 |
| rf/s3-jumps-b04 | e07fb91, one commit on top of f559527 (rebased; earlier ids dfb4729 / d526c16 are superseded) | step 3, B-04 re-landed. It contains all of rf/s3-jumps up to f559527, so merging it alone brings both |

## Status

- [x] 1. Ramp table matched to the Ranger's real take-off speeds (node probe; harness: see below)
- [x] 2. One landing readout, real distance, 10 $ floor
- [x] 3. B-04 re-landed on its own branch, proved by a placed-truck script beat (harness: see below)

## 1. The table

### How it was measured

- `tools/probe_jumps.mjs` (new, not in npm test): the harness `jumps` beat in node on the real bake.
  A fresh Ranger standing at `from`, full throttle, keyboard-shaped steering (full lock past 0.04 rad,
  input.js ramp rates) at `entry` (or `path`), the lip, then 40 m past. It records the speed at the
  first wheels-off tick of the flight that starts within 16 m of the lip, and that flight's air to
  the ground. `--search` and `--try` were used to pick run-ups.
- The harness beat itself was wrong in two ways, both fixed (tools/review/harness.mjs, page-agent.js):
  it stopped 40 m past the lip, so a fast ramp was timed mid-air, and its `lipKmh` was the speed
  0.3 s into the FIRST flight of the run (often the kerb onto the track). It now reports the flight
  off the lip to the ground (`air`, `dist`) and the take-off speed (`lipKmh`); the old reading stays
  as `maxAir`. A ramp may carry `path` (the run-up after `from`) when the straight line is blocked.

### Base 7272b85, harness `--only jumps`, fresh truck (pack rf-s3-jumps/base-7272b85-jumps, old beat)

5 of 12 never reached the ramp: buttesymmes, quaimarina, lavigne, arena (the straight line from
`from` to `entry` runs through yards, fences and a building) and hull (an obstacle 52 to 68 m along
it; 36 km/h at timeout). The 7 that flew: 1.47 to 1.73 s against 1.71 to 2.58 s promised.

### Per ramp (node probe, fresh Ranger from `from`, full throttle)

| ramp | old kmh / from | new kmh / from (path) | base pack: lip km/h, air (old beat) | new pack: take-off km/h | air predicted at new kmh | real air (new pack) | real / predicted |
|---|---|---|---|---|---|---|---|
| chantier | 100 / 725.5,-240.2 | 70 / same | 58.7, 1.73 s | 69.6 | 1.95 s | 1.94 s | 0.99 |
| garnotte (verge) | 65 / 866.0,-260.0 | 70 / 823.4,-255.5 | 78.3, 1.66 s | 77.8 | 1.81 s | 1.97 s | 1.09 |
| buttesymmes | 80 / -1466.7,52.1 | 65 / -1473.7,-33.6 | never reached | 59.9 | 1.69 s | 1.56 s | 0.92 |
| quaimarina | 75 / -1500.2,-30.8 | 70 / -1487.7,-63.2 | never reached | 70.7 | 2.19 s | 2.14 s | 0.98 |
| dunecedres | 70 / -1681.4,-448.3 | 70 / -1754.0,-444.0 (closer) | 80.3, 1.47 s | 83.6 | 1.72 s | 1.94 s | 1.13 |
| cineparc | 85 / -367.5,574.3 | 70 / same | 86.0, 1.48 s | 73.7 | 1.60 s | 1.47 s | 0.92 |
| vanier | 95 / 2245.6,-976.0 | 95 / 2249.5,-876.1 (100 m back) | 89.1, 1.63 s | 86.4 | 2.19 s | 1.97 s | 0.90 |
| eardley | 90 / -1680.9,-979.4 | 80 / -1630.8,-929.1, H 2.7 to 3.3 | 89.2, 1.56 s | 80.2 | 2.51 s | 2.17 s | 0.86 |
| lavigne | 90 / -82.5,-781.9 | 70 / -185.5,-836.9 | never reached | 70.2 | 1.77 s | 1.73 s | 0.98 |
| arena | 80 / -1124.0,257.5 | 80 / -1129.4,234.8, path -1030,302 then -990,312 | never reached | 81.9 | 2.07 s | 2.10 s | 1.01 |
| railkick | 100 / 1242,-461 | 75 / 1150,-445.1 (on the berm, 92 m back) | 68.8, 1.49 s | 73.6 | 1.91 s | 1.65 s | 0.86 |
| hull | 110 / 7724.0,-4282.8 | 75 / 7622.2,-4220.2, H 3.2/7.5 to 4.4/8.2 | 36 at timeout | 75.7 | 2.62 s | 2.82 s | 1.08 |

New pack: rf-s3-jumps/s3-bcf4d00-jumps (`--only jumps`, fresh Ranger, 12 of 12 flown, 0 exceptions,
worst mean 59.7 fps). All twelve within 15 %; the closest to the edge are eardley and railkick (both
-14 %) and dunecedres (+13 %). Base pack: rf-s3-jumps/base-7272b85-jumps (7 of 12 flown).

Garnotte note: bcf4d00 still had garnotte at kmh 80 from the old `from` (take-off 80.2, 2.09 s, 1.04).
smoke_firstminute caps the first ramp at 70 km/h, so f559527 moves `from` to 823.4,-255.5 and sets 70.
Its own pack on f559527 (rf-s3-jumps/s3-f559527-garnotte): take-off 77.8, 1.97 s against 1.81 (1.09); chantier in the same pack 1.93 s against 1.95. On rf/s3-jumps-b04 this row is replaced by B-04's ramp anyway.

How the old numbers were wrong: the old beat stopped measuring 40 m past the lip, so every fast
ramp was timed mid-air, and five ramps could not be reached at all, so the 55 to 85 % in feel.md
was partly the beat. The table was still 20 to 40 km/h above what the truck brings (chantier 100,
reaches 70; hull 110, reaches 76).

### Geometry changed (two ramps)

smoke_jumps flies every ramp on its axis at `kmh` and holds the set to: every ramp 1.4 s or more,
the biggest 2.2 s or more, five at 1.8 s or more, none under 25 m. At honest speeds two ramps fell
under it, so they were made steeper rather than the test loosened:
- hull: H 3.2 on 7.5 m to 4.4 on 8.2 m (slope 0.43 to 0.54). The set's big one: 2.23 s on the axis,
  2.78 s from its run-up. Landing damage 5.4 (cosmetic bar 25).
- eardley: crest H 2.7 to 3.3 (slope 0.43 to 0.52): 0.97 s to 1.60 s on the axis at 80.
- arena: no geometry change, but its beaten track passes 0.3 to 0.7 m from a building corner
  just past `entry` (-1029, 318). The bot path goes 7 m south of it. A player following the track
  clips the corner; the track itself is not moved here (open issue 2).
- dunecedres: `from` moved CLOSER (157 m): from 230 m the truck lands within 7 m of the lake and
  the dry-run-out check fails at any honest kmh.

smoke_jumps after: 89 / 89 (was 83).

## 2. One readout

The « 1.8 s / 0 m / CHAÎNE x2 / +2 $ » board was not a distance bug. cars.js kept `lastAir` from the
previous flight when a bounce lasted under 0.05 s, so the bounce after a landing (and every tick of
skitter on the run-up) was scored again as a full-length flight of 0 m: it made a chain of two, and
it used up the ramp's one full pay of the day. Measured on the old code with the probe: garnotte
scored 8 records (six of them `0.85 s / 0 m`) and the real 2.15 s flight paid 1 $; dunecedres 11
records and 1 $. Now each ramp scores once: garnotte 26 $, dunecedres 29 $, chantier 21 $.

- src/game/cars.js (one line): `lastAir` is 0 after a sub-0.05 s bounce.
- src/game/jumps.js: hops shorter than a chain link (1.0 s) near a ramp key their own repeat decay
  (`<id>:hop`), so the kerb onto the track no longer spends the ramp's day pay; a clean ramp landing
  of 1.5 s or more pays at least `floorPay` 10 $ before chain and decay (the second go the same day
  pays a quarter). Off-ramp air keeps its 3 $ a minute budget (Tom 29 Sept).
- src/main.js (marked block `[S3-JUMPS]`): the `n s dans les airs!` toast is gone; the `bigair`
  heckle stays. The board (jumps.js) is the only readout.
- smoke_jumps new group "one landing, one readout": one scored jump off the chantier, distance lip
  to touchdown (42 m), no second record, no main.js airtime toast, a clean 1.5 s ramp landing pays 10 $.

Found on the way and fixed (e4eb033): src/game/world/sector-worker.js never installed the ramps,
so index.html (which bakes land in the Worker) drew flat ground under every ramp while the physics
launched the truck. B-04 reported this on 13 Oct; nobody owned it. One import before `bakeWorld`,
plus a source check in smoke_jumps.

## 3. B-04 re-land (rf/s3-jumps-b04)

`git revert 3f13f87` on top of e4eb033 (one conflict, the garnotte row: B-04's on-road `prof` hump
at (806.0, -248.5) taken whole), then:
- garnotte `from` 925.0,-261.3 to 880.0,-256.6 (74 m short), `kmh` 65 to 70: from 119 m a fresh
  Ranger took off at 87 km/h and flew 2.60 s against 2.09 predicted; from 74 m it takes off at 71.7
  and flies 2.22 s against 2.24.
- tools/review/beats/B-04.mjs rewritten as the proof, no learner bot. It routes home to Canadian
  Tire with the game's Nav, checks the lip to route distance (bar 1.5 m), then PLACES a fresh Ranger
  on the route 55 m short of the lip at 60, 65 and 70 km/h and steps the sim at 1/60 s with W as
  cruise control and A/D following the route. Each run must take off within 16 m of the lip, stay
  within 3 m of the line, fly 1.6 s (SLOWMO.jumpAir), fire the jump slow-mo and fire no crash slow-mo.
- smoke_firstminute 46 / 46 and smoke_jumps 89 / 89 on that branch.

### The proof (pack rf-s3-jumps/b04-e07fb91, plan s3-b04: boot, B-04 beat, jumps garnotte + chantier)

B-04 beat 16 of 16 asserts:

| check | result |
|---|---|
| lip to the GPS route (home to Canadian Tire, 1597 m) | 0.01 m (bar 1.5), 452 m along it |
| placed at 60 km/h, 55 m short | takes off at 60, 0.1 m from the lip, 0.07 m off the line at worst, 1.93 s, jump slow-mo 1, crash slow-mo 0, 0 damage |
| placed at 65 km/h | 65, 2.05 s, slow-mo 1, crash 0, 0 damage |
| placed at 70 km/h | 70, 2.17 s, slow-mo 1, crash 0, 0 damage |
| fresh Ranger from `from` (jumps beat) | take-off 71.8, 2.23 s against 2.22 predicted (1.00), 0.9 damage |
| chantier on this branch | take-off 63.8, 1.81 s against 1.95 (0.93): its run-up hops the garnotte's west face first, as B-04 said |

Stills `012-B-04-ramp-30m.jpg` show the hump drawn across both lanes (the Worker fix) with the
callout « Essaie le tremplin » on screen. 0 console errors, 0 exceptions, worst mean 58.9 fps.

## Checks

- npm test: rf/s3-jumps 102 / 102 at f559527; rf/s3-jumps-b04 102 / 102 at d526c16 and again at e07fb91.
- boot (tools/qa/boot.mjs, ports 8276/9476): index and prototype ok, 0 console errors, W moved 144.6 m, on both branches.
- smoke_jumps 89 / 89 (was 83), smoke_firstminute 25 / 25 on rf/s3-jumps, 46 / 46 on rf/s3-jumps-b04.
- harness `--only jumps` fresh: base 7272b85 7 of 12 flown; bcf4d00 12 of 12 flown, all within 15 %; 0 exceptions, 59.7 fps worst mean.
- Packs under aylmer-madness/references/review/rf-s3-jumps/. (s3-6687816-jumps and s3-1731277-jumps are failed intermediate runs: the first hit a page-agent bug of mine, the second had traffic and cops in three run-ups.)

## Open issues for the lead

1. **The jumps beat now parks traffic and clears heat for the beat** (harness.mjs). In the run
   before that, vanier, eardley and hull took 64 to 80 damage head-ons with a car or cruiser on the
   run-up (heat left by earlier landings). The ramps are measured on an empty town; if the lead wants
   traffic in the pack, that is a separate beat.
2. **arena's beaten track clips a building**: the track's first leg passes 0.3 to 0.7 m from the
   corner at (-1029, 318). The bot path avoids it; a player on the track hits it. Moving `entry`
   about 6 m south fixes it but repaints the track; not done here (geometry of the track, not
   the run-up).
3. **Two ramps were made bigger** (hull 4.4 on 8.2, eardley 3.3) so smoke_jumps' set floors hold
   at honest speeds. Tom may prefer the set smaller and the test changed; I did not change the test.
4. **dunecedres lands within about 7 m of the lake** from a long run-up; its `from` is now 157 m so
   the harness truck arrives at 84 km/h. A player arriving faster will reach the water.
5. **cars.js and main.js edits are one line and one marked block**; the cars.js `lastAir` fix also
   stops style.js counting a bounce as a second air event (it reads the same field).
6. `tools/probe_jumps.mjs` is a dev tool, not in npm test. Nothing calls it.
7. The verge garnotte on rf/s3-jumps is only there if B-04 is not merged; on rf/s3-jumps-b04 the
   B-04 hump replaces it.
