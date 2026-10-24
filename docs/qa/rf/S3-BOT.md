# S3-BOT: the test bot as a fair stand-in for a decent keyboard player

Branch rf/s3-bot from fix/look-on-qr 7272b85. Ports 8278/9478. Only tools/review/ (page-agent.js, harness.mjs, beats/, plans/) and tools/ tests; no game code.

Status: done (racecivic still lost, see Open).

## What changed (all in tools/review/page-agent.js unless named)
1. Corner speed. cornerAhead now resamples the road ahead every 3 m (from the truck, through the route, on into the leg after a race gate) and reads each 15 m window as one bend: radius from the heading change, a corner speed at 62 % of the car's own grip (spec.grip), and a braking point at 60 % of its own brakes (spec.brake) less a reaction margin (3 m + 0.35 s). The old per-vertex angle missed corners drawn as short segments and used fixed 30/42/58 km/h. The handbrake rule (over 60 degrees, under 14 m, over 24 km/h) is kept.
2. Pursuit point 10 to 22 m along the route from the truck (was: the first route vertex 16 m away, which after a short corner node was 80 m down the next street, so the line to it cut through a lot into a building).
3. Routing. botRoute: the GPS route, unless the same streets driven against a one-way are under 80 % of it and 60 m shorter; then that (a second Nav over MAP with the one-ways opened, built once in the page, flags put back in the same block). bz_vieux cp3 to cp4: 397 m via Parker to 105 m down Bancroft. The game pays a wrong-way run (style.js oncoming), so this is what a player in a hurry does.
4. Routes are clipped where they pass the target and the next leg where it leaves it (a gate short of the last road node was a fake 180 degree hairpin).
5. Races and courses (m.race): the bot sits on the line through 3-2-1 (it used to roll early, a free head start), drives gates through without the stop-at-target lift, caps at 100 km/h instead of the 72 km/h errand cap, and has the next gate in its look-ahead.
6. Traffic: overtakes a car 8 to 45 m ahead that is 2 m/s slower, into a lane that is road (world.roadAt at 8, 18, 30 m) and clear of other cars for 70 m; holds the pass until the car is 8 m behind or 6 s. Following a car is its speed plus the closing speed that still stops short (was: a crawl to 8 km/h whatever the car ahead was doing). This was the racecivic stall (70 to 12 km/h behind traffic on Principale while Sayyad went by) and most of racedave's damage.
7. Rivals (G.rivals) count as road cars: passed, and only a nose-to-tail stop behind one (a4: 18 s at 1 to 11 km/h on Sayyad's bumper). Passing starts only from 6 m/s and for a car 2 m/s slower (passing from a crawl, tried in faf0ef9, weaved behind traffic and lost racedave in a5; reverted in 9aaceca).
8. Three-point turn when the road is behind and there is no room (the dep on bz_vieux sits at the end of a lot): back on opposite lock, forward on full lock, each until it stalls or 2.5 s, until within 45 degrees; replaces the single 2.6 s reverse.
9. Golf night fence (stage kind 'fence'): ride to a run-up 16 m short of the middle of the wire, then square at it, tap Space when « Espace : sauter la clôture » is up and the wire is 2 to 7 m ahead; a bounce backs off and comes again; going round the end goes back to the run-up.
10. Feel probe (tools/review/beats/feel-probe.mjs, plans/feel-probe.json, both from runs/feel-probe-beat/): in full.json and quick.json right after the (last) crash beat. To make it run: C (camera) through the page's synthetic key (the harness real-key table has no C: "undefined is not iterable"); the acceleration run stops 4 s past 100 km/h or 150 m short of the straight's end (45 s flat out ran into a wall, so the stop was measured from 1.3 km/h); the jump waits for its own aim task's end (it read the floor task's); the camera preset and the truck's damage, money and car are put back at the end; 5 validity asserts.
11. tools/smoke_bot.mjs (new, npm test): loads page-agent.js in a vm against the real road graph: the Parker corner reads as one corner and the cap at 33 m is under 60 km/h, a point-mass drive at the bot's caps reaches the corner under the grip limit, a straight sets no cap, one vertex and six short chords read the same, cp3 to cp4 goes down Bancroft, the pursuit point stays at the corner, a gate short of the last node is not a hairpin, overtaking starts and refuses a blocked lane or the kerb.

## Before (base 7272b85, packs in aylmer-madness/references/review/rf-s3-bot/before-*)
- course (quick plan, bz_vieux): fail on the clock. cp1 to cp3 fine, but on du Patrimoine it crawled at 6 to 13 km/h for 20 s behind traffic; cp3 to cp4 routed west to Parker (GPS 397 m, Bancroft is one-way north), south on Parker at 76.6 km/h, wedged at (-931.6, -97.2) on the British Hotel wall, damage 0 to 11, sat there until the clock ran out.
- golfcart fresh: fail. Stages 0 to 10 ok (chase flags and bikes in time), stage 11 (fence) 480 s with « Espace : sauter la clôture » up, two teleports, abandon.
- racecivic fresh: lost. Led by up to 31 m, then 70 to 12 km/h stops (traffic in the lane), damage 1.3 to 21.4 in one hit, lost by about 110 m. Top speed 70.1 (the 72 km/h job cap).
- racedave fresh: lost. Led by 20 m, then the same traffic stops (7.6, 10.5, 12.8 km/h on straights), damage 18.4, lost by about 160 m. Top 70.1.

## After (packs in aylmer-madness/references/review/rf-s3-bot/a2 to a6; each run is one sample, traffic varies)
| beat | before (7272b85) | after |
|---|---|---|
| course bz_vieux (quick, `--only course`) | wedged on the British Hotel at 76.6 km/h after the Parker corner, clock out at cp4 (1 of 6 legs left undone: 3) | no wedge in 4 runs: cp3 to cp4 down Bancroft at up to 59 km/h, cp4 and the dep reached; a4 (f69a912) ran out of clock 110 m from the line, damage 5.1. Still a fail on the clock: about 10 s over the 140 s it had (pace car 119 s) |
| golfcart fresh | stage 12/12 fence: 480 s, abandon | done, 3.07 min, fence stage 20.8 s, no assist at the fence (a3, f402f88; a2 with the first fence code went round the wire end and needed teleports) |
| racecivic fresh | lost by about 110 m, damage 29.7, top 70 | lost every run: by 9 m (a2), 21 (a3), 82 (a4), about 100 (a5), about 320 (a6). Top 98 km/h |
| racedave fresh | lost by about 160 m, damage 18.4, top 70 | won 4 of 5: a2 (2.38 min, led by up to 480 m), a3, a4 (damage 0.4), a6 (2.15 min); lost a5 (the reverted crawl-pass build) |
| feel probe (feel-probe plan) | never ran | runs, ok, 5/5 asserts, 0 console errors (a3, then the camera fix). Ranger 0-50 4.55 s, 0-100 10.85 s, 119.5 to 0 in 3.58 s / 63.7 m; steering t90 483 ms at 60, 417 ms at 100; handbrake from 50: no 180 in 5 s (11.1 m, max skid 0.5); 70 km/h crash: hit 423 ms in, 32 damage, one hitstop 100 ms, one slow-mo, debris 0, camPunch 0; 3 stars: a cruiser in frame 50 of 60 half-seconds, nearest 81 to 162 m (never close); chantier at 100: lip 91.7 km/h, 2.11 s air against 2.35 predicted |

## Checks
- npm test: 103/103 suites (smoke_bot new, 17 checks), exit 0 (rf-s3-bot/npm-test.log, at faf0ef9; 9aaceca only changes two numbers in passPlan back and smoke_bot passes on it).
- tools/qa/boot.mjs, ports 8278/9478: index ok (25.9 s, 0 console errors, W moved 144.6 m), prototype ok (106.3 s, 0 errors, 144.6 m).
- Harness runs listed above, all `--rev <commit>` on ports 8278/9478, 0 console errors.
- harness.mjs not touched. Plans: full.json and quick.json get one script beat each (feel-probe after the last crash beat); smoke_review_vehicle still green.

## Open for the lead
1. racecivic is still lost by the bot, by 9 to 320 m depending on traffic on Principale. What is left is mostly traffic: the bot waits behind a car it cannot pass (oncoming lane busy, a school bus across the Wilfrid-Lavigne junction in a5) while the rival brakes only for a car within 10 m and 2.6 m of his line (race.js AVOID_D, AVOID_W), so he goes through traffic the bot and a player have to drive round. That is a game question (rivals and traffic), not a bot fix; missions.md finding 2's pace-bot idea and Tom's one play still apply.
2. racedave now goes to the bot 4 times in 5 at 98 km/h in a Ranger, with leads up to 480 m on chemin d'Aylmer: this supports missions.md's "too easy for a human" read. DIFF.rival is still not wired into racejobs.js (game code, not mine).
3. bz_vieux is now about 10 s short on the clock with clean driving; the bot loses time on the wrong-way Bancroft run (oncoming one-way traffic), the dep's dead-end lot (a three-point turn, about 8 s) and traffic on du Patrimoine (a6 took 20 damage there head-on). A human may well make it; not a reason to change the clock.
4. The bot now drives against one-ways when that is under 80 % of the GPS route and 60 m shorter. If the lead would rather the bot follow the blue line in story jobs, botRoute can be limited to m.race stages (one line).
5. The feel probe's numbers above are first readings for the feel tasks (handbrake 180 does not complete from 50 km/h with D + Space only; crash has no debris and no camera punch; cruisers never closer than 81 m).
