# W6-CURFEW: Nachos avant Little Big Man (mission 10) vs its 160 s clock

Branch rf/w6-curfew from fix/look-on-qr at 813b1a7. Hard stop 11:56 PT, about 10 minutes of work. No code changed.

## Question
The bot fails curfew on its clock (« Trop tard ») from the marina in S4-SUMMER (bot-3fc23a8) and in runthrough-2026-10-20 (both columns; it was done on 13 Oct when the clock was 210 s). Does the route the job asks match the route tools/timers.mjs paces?

## Findings
1. Start point: matches. The game starts the job at PLACES[def.giver] (main.js 1913, 3289, 3317, 3347), giver 'marina' (-1766, -88). tools/timers.mjs clocks() starts from the same PLACES[def.giver]. S4-SUMMER's date gates (day 75, MISSION_WINDOWS.curfew = [2,5] h) only decide when the job is offered; the stage still starts at the marina. Target 'home' (299 Fraser), 3,189 m both ways. No start-point fix needed.
2. Clock: set by the rule. timers_pace.json at 813b1a7: curfew 1/1 pace 116.8 s, top 117 km/h, resets 1. clockFor(116.8) = round((116.8 + 3) x 1.35 / 5) x 5 = 160. missions.js has time: 160. Correct by the rule.
3. One real mismatch the pace does not model: the stage has maxSpeed: 35 inside a 14 m circle (missionkit.js 115: inside the circle above 35 km/h the stage does not finish). The pace car's done() in timers.mjs (about line 255) counts arrival on distance only, so it finishes at full speed. A player (and the bot) must be down to 35 km/h inside 14 m, so they brake from about 100 km/h before the drive. Estimate: about 1 to 3 s extra (braking 100 to 35 km/h at about 8 m/s2 is about 2.3 s and 42 m). With 2 s: clockFor(118.8) = 165, i.e. +5 s. The same gap applies to every stage with maxSpeed and a clock (hullmuseum 45, chelsea 45, arc beach 35).
4. The pace car also reset once on this route (resets: 1), so the 116.8 s already includes a reset; the honest pace may be a little lower, which offsets point 3. Not checked in the time I had.
5. The bot's failing run took 2.75 min (165 s), about 5 s over 160. So the bot is near the bar, consistent with point 3 plus bot slowness, not a wrong route.

## Recommended fix (not done, out of time)
In tools/timers.mjs pace loop, when stageRef.maxSpeed is set, make done() also need rv.speedKmh <= maxSpeed, or add an analytic brake allowance (v_entry - vmax) / 8 m/s2 to the pace. Rerun `node tools/timers.mjs --pace`, then set curfew (and any other maxSpeed stage) to the new clockFor value. Never loosen smoke_timers; the new clock still has to pass its CEILING_KMH check (160 s for 3.2 km is 71.7 km/h, 165 s is 69.6 km/h, so it passes).

## Checks
- `node tools/timers.mjs --pace` rerun at 813b1a7 (node only, no browser): curfew 1/1 116.2 s, top 117 km/h (was 116.8). clockFor(116.2) = 160, unchanged. Other clocks drifted by up to 1.6 s (arcbache 80.8 to 82.4), so the regenerated timers_pace.json and timers.md were not committed (restored to the branch copy); the lead or s1-timers owner should know the pace is not exactly repeatable.
- npm test not run (no code change).

## Browser checks for the lead (cloud)
- Harness, bot, `--plan finale --only curfew --columns played` at the fixed commit: bar is curfew done, with the stage time printed, under the clock.

## Wave 7 (27 Oct): fix done

Merged fix/look-on-qr (786acf4) first, then again after Tom's Mac crash (the head had moved: race.js Rival traffic changes, racejobs.js difficulty and English lines). Clean merges.

### 1. The pace car meets the maxSpeed circle (tools/timers.mjs)
- A stage with `maxSpeed` now finishes for the pace car only inside the circle AND at or under the cap, the same test as missionkit stageStep.
- To get there the pace car brakes on a plan: race.js Rival's existing `ctx.cap` (m/s) is set every step to sqrt(v0^2 + 2 x BRAKE_MS2 x d), d = straight distance to the circle's edge, v0 = cap minus VMAX_MARGIN. BRAKE_MS2 = 6 (firm, under the Ranger's 8.0 limit), VMAX_MARGIN = 3 km/h. Only the last leg of a clock is capped (no capped stage is part of a shared clock). race.js itself is untouched.
- The circle default is now 14 m, missionkit's stageTarget default, instead of 16 (the blitz keeps 16, as paced before). Every capped stage sets its own radius, so this changes no clock today.
- Every capped stage arrives at the cap: arcbache 35, curfew 35, museum 45, chelsea 45 (printed by `--pace`, kept in timers_pace.json as `arriveKmh`).

### 2. Re-paced and clocks to the rule, (pace + 3) x 1.35 rounded to 5
Old logic and new logic were both run on the merged head, to split the brake from map drift:

| clock | old logic s | new logic s | brake cost s | clock was | clock now |
|---|---:|---:|---:|---:|---:|
| arcbache 2/5 (35 km/h) | 82.0 | 84.8 | +2.8 | 115 | 120 |
| curfew 1/1 (35 km/h) | 116.8 | 119.4 | +2.6 | 160 | 165 |
| highwayhull 2/3 museum (45 km/h) | 260.2 | 263.3 | +3.1 | 355 | 360 |
| chelsea 1/1 (45 km/h) | 340.8 | 342.2 | +1.4 | 465 | 465 |
| margaretdental 2/2 (no cap) | 85.0 | 85.0 | 0 (map drift from 83.3) | 115 | 120 |
| blitz (no cap) | 154.2 | 154.2 | 0 (map drift from 149.9) | 205 (130+15x5) | 210 (135+15x5) |

The 2.6 s brake cost on curfew matches the estimate above (2.3 s). Curfew now asks 69.6 km/h over 3.2 km against a 151 s ceiling: beatable by a good driver, with 45 s over the pace car that already brakes for the pillar. Everything else is unchanged (within a rounding of the rule).
Files: src/game/missions.js (curfew 165, museum 360), src/game/arc.js (beach 120), src/game/lifejobs.js (dental 120), src/game/racejobs.js (BLITZ_CLOCK 135, and the grid line now says « cent trente-cinq secondes »). smoke_timers 68/68, smoke_race 215/215.

### 3. Why l'alternateur has no clock: on purpose
Not a bug. missions.js sets `time: null` on both stages and says so: « The first errand doubles as an untimed driving lesson. » The brief tells the player « une commission sans chrono pour apprendre à conduire », and the brief card reads « Aucun chrono. Prends ton temps. » (redteam first-hour.md). missions.md (redteam) lists it as « Untimed lesson ... cannot fail, Keep ». The only clock idea on record is first-hour.md's B-16 « Margaret's soft clock on alternateur stage 2 (F3, if Tom says yes) », which waits on Tom. Left untimed. timers.mjs skips untimed stages by design (`st.time && ...`), and its « Every stage » table lists both legs with `-`.

### Notes for the lead
- The pace is still not perfectly repeatable across map changes: margaretdental and the blitz moved 1.7 and 4.3 s between 813b1a7 and 786acf4 with no clock code change. Within the same commit it is deterministic (seeded Math.random): two runs on 786acf4 gave identical numbers for the uncapped clocks.
- Pace car resets on these routes: curfew 1, chelsea 2, blitz 3, sayyad 1. A reset puts the car back on the route and costs time, so these paces are a little generous, not tight.
- Out of scope, not fixed: the blitz pace car finishes a gate at 16 m but racejobs.js GATE_R is 18 and FINISH_R 20, so the blitz pace is slightly pessimistic.

### Cloud checks for the lead
- Harness bot, `--plan finale --only curfew --columns played`: curfew done under 165 s, stage time printed.
- Same for arcbache (beach stage, 120 s) and highwayhull stage 2 (museum, 360 s) if the plan covers them.
- Blitz: the grid line reads « cent trente-cinq secondes » and the clock starts at 135.

### Checks (moved off the Mac after the 27 Oct crash)
- First pace and smokes ran on the Mac before the new rule (10 s pace, smoke_timers, smoke_race). A full `npm test` was started on the Mac and died with the crash; it did not finish and is not counted.
- New tools/run_pace.mjs: the same pace as `timers.mjs --pace`, numbers to stdout, writes nothing, not in the suite (it bakes the world). timers.mjs now exports paceAll for it.
- Colab, after the second merge: run_pace.mjs GREEN, 0 clocks off the rule. Its pace JSON matches the committed tools/timers_pace.json exactly (max difference 0.0 s), so the race.js changes merged today do not move any clock.
- Colab: smoke_timers 68/68, smoke_race 215/215, smoke_w6races GREEN.
- Colab full suite at 0f7ec2d: 107/111, RED on smoke_medals only (plus the three VM-only fails). Cause: the medal system merged today (w6/w7-replay, src/game/medals.js) carries STAGE_PACE, a frozen copy of timers_pace.json, and it was the old pace. Fixed at 4d4df05: STAGE_PACE regenerated from the new timers_pace.json, BLITZ_BUDGET['blitz 2/2'] 205 to 210 (the real story blitz budget now). smoke_medals pinned its judging fixture to dep 2/2 thresholds 38/42/48 (pace 42.0); dep is now 43.1 (map drift, not the brake), so 39/43/50. Every case moved with its threshold (same margins and gaps, same strings except the bronze-on-the-line gap, now 7,0 instead of 6,0). Same number of checks, none removed or widened. Lead: this touches the replay branch's test; check you agree.
- Colab after the fix: smoke_medals 112/112, smoke_modes 138/138, smoke_timers 68/68.
- Colab full suite at 581b754: 107/111, the only real failure smoke_replay (4 of 26): the same dep 2/2 fixture (38/42/48) as smoke_medals. Fixed at cc5a8cc the same way: runs moved with their thresholds (bronze run 46,3 to 47,3, record run 39 to 40), the fail estimate now reads 17 s (67 s against bronze 50, was 19 against 48). smoke_replay 26/26 and smoke_medals 112/112 on Colab.
- The full suite was run twice (brief limit), so cc5a8cc has named-file runs only: smoke_replay, smoke_medals, smoke_modes, smoke_timers, smoke_race, smoke_w6races all green. Every other suite was green at 581b754, and cc5a8cc only changes smoke_replay.mjs. VM-only fails as always: smoke_audio, smoke_harness_gate, smoke_models.

### Where I stopped
Done. Branch rf/w6-curfew, not merged, not pushed.
