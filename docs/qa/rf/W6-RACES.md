# W6-RACES (builder w6-races, 20 Oct 2026)

Branch rf/w6-races from fix/look-on-qr at 813b1a7.

## Step 1: DIFF.rival wired into story races (done)
- src/game/racejobs.js: new exported `rivalSkill(G, sk)`; raceMission's rival setup uses it. modes.js races go through raceMission, so both paths get it.
- Scales cruise by DIFF[G.difficulty].rival / DIFF.normal.rival. Normal is unchanged (every race was tuned at normal), easy x0.854, hard x1.122. No G.difficulty (node suites) means no change.
- Dave cruise: easy 16.05, normal 18.8, hard 21.09 m/s.
- Note: the calendar comment says rival is "a fraction of YOUR car's top speed". I used a ratio against normal instead so normal stays as tuned. Lead to decide if the absolute reading is wanted.
- Test: tools/smoke_w6races.mjs (node, picked up by npm test).

## Step 2: rivals avoid traffic like a player (done, wave 7, 27 Oct, commit 46a0357)
Wave 7 merged fix/look-on-qr (786acf4) first. All in src/game/race.js Rival.update section 3 plus two new methods (_passPlan, _laneClear), page-agent.js passPlan rules with the same numbers:
1. Look grows with speed: max(AVOID_D 10 m, FOLLOW_T 1.6 s x speed). At 65 km/h that is 29 m (was 10 m, why Sayyad drove through cars).
2. Follow, not slam: a car in his lane caps his speed at its own speed plus the closing speed that stops FOLLOW_GAP (8 m centre to centre) short at 5 m/s2. Full brake only inside HARD_D 6 m and closing. Want under 1 m/s holds the brake (no creeping into a stopped car).
3. Pass: a car 8 to 45 m ahead and 2 m/s slower (or stopped within 25 m), from 6 m/s up, goes one lane over (3.4 m, opposite side first, then the other) if that lane is road (roadAt at 8, 19, 30 m) and free of cars for 70 m; back once it is 8 m behind, after 6 s, or if the lane stops being clear for 40 m. The offset moves the pure-pursuit aim in the car frame. Counter rv.passes.
4. skill.avoid: now scales only the air between bumpers (CAR_L 4.5 m is never scaled). Kevin Boucher (0.45) tailgates at about 4.6 m centre to centre where others sit at 6.2 m, but no longer rams cars. First try scaled the look too, and the node test caught him at 1.8 m centre to centre (inside the car). Lead/Tom: if "brakes for nobody" must mean real contact, that is a one-line change back.
5. Stuck watchdog: queued behind a car in his lane does not count as stuck for up to FOLLOW_MAX_T 10 s (no teleport hop through a car at a red).
6. No per-frame allocations: all state on the Rival, scratch reused.
Node test (tools/smoke_w6races.mjs): slow car (22 km/h) 25 m ahead: 0 contacts over 6 s, never under 3 m/s, passed (Sayyad and Dave); boxed in by oncoming cars both sides: follows, 0 passes, 0 contacts; stopped car with no room: stops 6.1 m short, 0 resets; avoid 0.45 follows closer than 1.0.
Ran on the Mac before the 27 Oct crash rule: smoke_w6races ok, smoke_race 215/215.

## Step 3: racedave too easy (done, wave 7, 27 Oct)
Tool: tools/sim_racedave.mjs (node, not in npm test; loads the world, so VM only via colab-test/ct.py). Adam's Sunfire, built as racejobs.js builds him (normal difficulty, same rubber band), against a player stand-in in the Ranger on the real marina to Galeries route (2,028 m), medium traffic (26 cars), 10 traffic seeds. Player stand-in: the timers.mjs pace car capped at 100 km/h (the bot's race cap), same traffic rules as the rivals, Dave not in its follow list (bot rule S3-BOT fix 7). Clean = no mistakes; sloppy = two mistakes (at 35 % and 70 % of the route the truck loses all speed and pulls away again, about 5 s each).

Numbers (VM, commit after daveSprint):
| Dave tuning | no traffic: you / Dave | clean median margin | clean wins | sloppy median margin | sloppy wins |
|---|---|---:|---:|---:|---:|
| old `dave` cruise 18.8 | 88.7 / 109.4 s | +29.4 s | 10/10 | +14.9 s | 10/10 |
| `daveSprint` cruise 22.5 (shipped) | 88.8 / 98.0 s | +1.5 s | 5/10 | -5.0 s | 4/10 |
Margin + is the player ahead at the line. Sweep tried before choosing (same sim): cruise 21 clean median +8.6 / sloppy +0.9 (sloppy still wins); 24 +3.0 / -4.9; 25.5 -2.1 / -6.7 (clean loses); cruise 24 cornerK 0.55 +3.3 / -5.3 but Dave alone runs 94.3 s.
Why 22.5: medians land on the brief (clean wins small, sloppy loses), and Dave alone stays at 98.0 s, slower than smoke_race's "driven properly" teleport (96.6 s at 75 km/h), so that test is untouched (215/215).
Change: new SKILL.daveSprint in race.js (dave with cruise 22.5); racedave uses it. SKILL.dave is unchanged, so the circuit and the modes courses (which also run Adam on `dave`) are exactly as hard as before. Difficulty scales it: easy 19.2, hard 25.2 m/s.
Caveat: traffic swings single races by up to 40 s either way (seed 5: Dave stuck, +41 s; seed 31: the player stuck, -34 s); the win counts per 10 are noisy, the medians are the signal. Rival and player resets (stuck hops) both still happen in traffic, 0 to 3 per race.

## Cloud checks for the lead (browser)
- Bot racedave 5 runs at normal: expect a close race (S3-BOT had 4 of 5 bot wins by up to 480 m); a loss is now possible.
- Bot racecivic 5 runs: Sayyad now follows and passes traffic instead of driving through it; watch for him weaving or sitting behind a bus.
- Watch a rival pass in the browser: the 3.4 m lane offset should look like a lane change, not a swerve onto the sidewalk.
- Perf at medium with a race running (two extra loops over traffic per rival per frame, no allocations).

## Browser checks for the lead (cloud, from wave 6)
- Bot racedave and racecivic, 5 runs each, at easy/normal/hard after step 1 (hard should beat the bot more often than normal; easy less).
- Boot both entries, 0 console errors.

## Checks at hard stop (11:54)
- node tools/smoke_w6races.mjs: ok.
- npm test through qa-slot (AYLMER_QA_SLOTS=1): 105/105 suites passed (finished just after the stop; wall-clock timing suites skipped as usual).
- Step 2 draft (follow speed and a lookahead that scales with speed) is in the plan above. Nothing was applied to race.js.

## Checks, wave 7 (27 Oct, all on the Colab VM via ct.py after the crash rule)
- Named: smoke_w6races, smoke_race 215/215, smoke_modes 43/43, smoke_racestarts, smoke_econ, smoke_retry: green.
- Full suite at af7a6a0: 102/105, the 3 failures are the known VM-only ones (smoke_audio, smoke_harness_gate, smoke_models), ct: RESULT GREEN. Lead reruns those 3 on the Mac at merge.

## Open for the lead / Tom
1. Kevin Boucher (skill.avoid 0.45) now tailgates (about 4.6 m centre to centre) instead of driving into traffic. If "brakes for nobody" must mean real contact, scale the look by avoid again (one line in race.js section 3).
2. DIFF.rival is applied as a ratio to normal (step 1), not as a fraction of the player's top speed as the calendar comment says.
3. racedave's win toast says Adam arrives "douze secondes plus tard"; a clean win is now usually a few seconds. Text left alone (not my task); Tom may want it changed.

## Where I stopped
Steps 1 to 4 done. Branch rf/w6-races, not merged, not pushed.
