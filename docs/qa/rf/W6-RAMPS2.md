# W6-RAMPS2: arena track clears the corner, the dune lands further from the lake

Wave 6 builder stopped at the 20 Oct 11:56 hard stop. Wave 7 (27 Oct) finished it after the lead's merge
failed smoke_jumps ("dunecedres: NO AIR off the ramp itself", "all of them flew") and was reverted (786acf4).

## What changed (src/game/jumps.js only, both lines marked [w6-ramps2])
- arena: `entry` -1037.0, 316.8 to -1037.0, 310.8 (6 m south), so the track centreline passes about
  6.4 m from the corner at (-1029, 318) instead of about 1.3 m. Unchanged from wave 6.
- dunecedres: crest moved 6 m inland along its own axis, -1910, -426 to -1904.1, -426.8.
  Wave 6 moved it 12 m. That put the mound on the inland hillside, where the base falls about 7 %
  toward the lake, and the bot run at 70 km/h left the ground for under the 0.75 s that counts as air:
  NO AIR. At 9 m it flew 0.88 s (under its 1.05 s floor). At 6 m it flies better than at the old spot.

## Wave 7 steps
1. Merged fix/look-on-qr (fast-forward to 786acf4, which undid the wave 6 change).
2. Re-applied the wave 6 change as a new commit (99e9323).
3. Measured candidates (before the 27 Oct 00:55 no-local-tests rule; after it, nothing ran on the Mac).
4. Settled on 6 m (36f66c5). smoke_jumps on the Colab VM: 89 passed, 0 failed, GREEN.

## Numbers (Ranger, on the real bake)
Dune, bot on the axis from 55 m back at a held speed (smoke_jumps' `fly`); "wet" is touchdown to nearest water:

| crest | 70 km/h | 80 | 90 | 100 | 110 |
|---|---|---|---|---|---|
| old (-1910, -426) | 1.10 s, wet 32 m | 1.75 s, 18 m | 2.00 s, 9 m | 2.18 s, 3 m | 2.32 s, 1 m |
| 12 m inland (wave 6) | NO AIR | 1.77 s, 32 m | 1.95 s, 23 m | 2.08 s, 15 m | 2.22 s, 9 m |
| 9 m inland | 0.88 s, 42 m | 1.12 s, 37 m | 1.35 s, 30 m | 1.60 s, 22 m | 1.65 s, 18 m |
| **6 m inland (shipped)** | **1.33 s, 34 m** | 1.42 s, 30 m | 1.60 s, 22 m | 1.88 s, 12 m | 2.12 s, 4 m |

Taller mounds at 12 m (H 3.0, 3.2) still only made 0.77 s at 70.

Dune, standing start, keyboard-shaped steering (probe_jumps style):
- old crest: table `from` 2.00 s, touchdown 10 m from water; from 230 m (-1681.4, -448.3) 2.28 s, 1 m from water.
- 6 m inland: table `from` 1.67 s at 82 km/h take-off, 21 m from water; from 230 m 1.92 s at 94 km/h, 9 m from water.

Arena (probe_jumps from the table `from`): lip 71.5 km/h, take-off 82.5 km/h, 2.15 s, 49 m, 1.04 of
prediction. smoke_jumps: 1.92 s, 39 m, 75 km/h in, clean.

So the dune flies again (1.33 s at the test speed, up from 1.10 s at the old spot) and lands on dry ground
at every speed tried, but the fastest arrival (from 230 m, 94 km/h) touches down 9 m from the water,
short of the wave 6 bar of 15 m. The old spot was 1 m.

## Checks
- smoke_jumps on the VM at 36f66c5: 89 passed, 0 failed (log colab-test/logs/36f66c5-1027-014709.log).
- Full suite on the VM at f56e3c0: 101/104, the 3 failures are the known VM-only ones (smoke_audio,
  smoke_harness_gate, smoke_models): RESULT GREEN. The lead reruns those 3 on the Mac at merge
  (log colab-test/logs/f56e3c0-1027-020106.log). Two earlier full-suite tries died on a lost VM connection.

## Open, for the lead
1. The fast dune arrival lands 9 m from the water, not 15. More inland distance kills the 70 km/h flight
   (the hillside); fixing both needs the approach graded level (the "piece 3" smoke_jumps names), which is
   terrain work outside this task.
2. Arena track edge (centreline plus or minus 8 m) against the corner at (-1029, 318) was not measured in
   the bake; smoke_jumps "nothing solid on the line" passes for arena.

## Cloud checks for the lead
- `--only jumps` harness beat for arena and dunecedres (take-off within 15 % of predicted).
- Drive the dune from the Raoul-Roy lot at full throttle and watch the landing against the lake edge.
